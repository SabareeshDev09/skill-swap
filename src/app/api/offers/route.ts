import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/auth/server';
import { normalizeSkillName } from '@/lib/skills';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (user instanceof NextResponse) return user;

    const admin = getSupabaseAdmin();

    // Fetch offers where user is proposer or recipient
    const { data: offersData, error: offersError } = await admin
      .from('offers')
      .select('*, proposer:profiles!offers_proposer_id_fkey(full_name), recipient:profiles!offers_recipient_id_fkey(full_name)')
      .or(`proposer_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (offersError) {
      console.error('Error fetching offers:', offersError);
      return NextResponse.json({ offers: [], sessions: [] });
    }

    const offerIds = (offersData || []).map((o) => o.id);
    let sessionsData: Array<Record<string, unknown>> = [];

    if (offerIds.length > 0) {
      const { data: sessionsRes, error: sessionsError } = await admin
        .from('sessions')
        .select('*, teacher:profiles!sessions_teacher_id_fkey(full_name), learner:profiles!sessions_learner_id_fkey(full_name)')
        .in('offer_id', offerIds)
        .order('leg_index', { ascending: true });

      if (!sessionsError && sessionsRes) {
        sessionsData = sessionsRes;
      }
    }

    return NextResponse.json({
      offers: offersData || [],
      sessions: sessionsData || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve offers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (user instanceof NextResponse) return user;

    const body = await req.json();
    const {
      proposerName,
      recipientId,
      recipientName,
      type,
      quote,
      message,
      durationMinutes,
      chargedTokens,
      skillName,
      proposerSkillName,
    } = body;

    const proposerId = user.id;
    if (!recipientId || recipientId === proposerId || !type || !quote) {
      return NextResponse.json({ error: 'Missing required proposal fields' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const holdPaise = Math.round((chargedTokens || 0) * 100);

    // 1. Check wallet and hold escrow tokens
    const { data: walletData } = await admin
      .from('wallets')
      .select('*')
      .eq('user_id', proposerId)
      .single();

    if (walletData) {
      if (walletData.available_paise < holdPaise) {
        return NextResponse.json(
          { error: 'Insufficient funds in wallet for escrow hold' },
          { status: 400 }
        );
      }

      await admin
        .from('wallets')
        .update({
          available_paise: walletData.available_paise - holdPaise,
          held_paise: walletData.held_paise + holdPaise,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', proposerId);
    }

    // 2. Insert into offers table
    const { data: offerRecord, error: offerError } = await admin
      .from('offers')
      .insert({
        type,
        proposer_id: proposerId,
        recipient_id: recipientId,
        status: 'ACCEPTED',
        swap_factor: 0.3,
        quote_snapshot: quote,
        message: message || '',
        expires_at: new Date(Date.now() + 48 * 3600000).toISOString(),
      })
      .select()
      .single();

    if (offerError || !offerRecord) {
      console.error('Error inserting offer:', offerError);
      return NextResponse.json({ error: 'Failed to create offer record' }, { status: 500 });
    }

    // 3. Record HOLD in ledger_transactions
    await admin.from('ledger_transactions').insert({
      reference_id: offerRecord.id,
      transaction_type: 'HOLD',
      source_wallet_id: proposerId,
      amount_paise: holdPaise,
      idempotency_key: `idemp-hold-${offerRecord.id}`,
      metadata: {
        proposerName,
        recipientName,
        chargedTokens,
        type,
      },
    });

    // 4. Resolve taxonomy skills if available
    const { data: taxonomy } = await admin.from('skill_taxonomy').select('id, name');
    const taxMap = new Map((taxonomy || []).map(t => [normalizeSkillName(t.name), t.id]));
    const skill1Id = skillName ? taxMap.get(normalizeSkillName(skillName)) || null : null;
    const skill2Id = proposerSkillName ? taxMap.get(normalizeSkillName(proposerSkillName)) || null : null;

    // 5. Create Session Legs
    const sessionLegsToInsert = [
      {
        offer_id: offerRecord.id,
        leg_index: 1,
        teacher_id: recipientId,
        learner_id: proposerId,
        skill_id: skill1Id,
        skill_name: skillName || 'Skill',
        duration_minutes: durationMinutes || 60,
        list_price_tokens: quote.proposerLeg.listPriceTokens,
        charged_tokens: quote.proposerLeg.chargedTokens,
        platform_fee_tokens: quote.proposerLeg.platformFeeTokens,
        teacher_payout_tokens: quote.proposerLeg.teacherPayoutTokens,
        scheduled_start: new Date(Date.now() + 2 * 3600000).toISOString(),
        scheduled_end: new Date(Date.now() + 3 * 3600000).toISOString(),
        meet_link: 'https://meet.google.com/new',
        status: 'SCHEDULED',
        teacher_confirmed: false,
        learner_confirmed: false,
      },
    ];

    if (type === 'SWAP' && quote.recipientLeg) {
      sessionLegsToInsert.push({
        offer_id: offerRecord.id,
        leg_index: 2,
        teacher_id: proposerId,
        learner_id: recipientId,
        skill_id: skill2Id,
        skill_name: proposerSkillName || 'Skill',
        duration_minutes: durationMinutes || 60,
        list_price_tokens: quote.recipientLeg.listPriceTokens,
        charged_tokens: quote.recipientLeg.chargedTokens,
        platform_fee_tokens: quote.recipientLeg.platformFeeTokens,
        teacher_payout_tokens: quote.recipientLeg.teacherPayoutTokens,
        scheduled_start: new Date(Date.now() + 26 * 3600000).toISOString(),
        scheduled_end: new Date(Date.now() + 27 * 3600000).toISOString(),
        meet_link: 'https://meet.google.com/new',
        status: 'SCHEDULED',
        teacher_confirmed: false,
        learner_confirmed: false,
      });
    }

    const { data: createdSessions, error: sessionError } = await admin
      .from('sessions')
      .insert(sessionLegsToInsert)
      .select();

    if (sessionError) {
      console.error('Error inserting sessions:', sessionError);
    }

    // 5. Create chat thread for this offer
    await admin.from('chat_threads').upsert(
      {
        offer_id: offerRecord.id,
        status: 'OPEN',
      },
      { onConflict: 'offer_id' }
    );

    return NextResponse.json({
      success: true,
      offer: {
        id: offerRecord.id,
        type: offerRecord.type,
        proposerId,
        proposerName: proposerName || 'You',
        recipientId,
        recipientName: recipientName || 'Peer',
        status: offerRecord.status,
        message: offerRecord.message,
        quote,
        createdAt: offerRecord.created_at,
        expiresAt: offerRecord.expires_at,
      },
      sessions: (createdSessions || []).map((s) => ({
        id: s.id,
        offerId: s.offer_id,
        legIndex: s.leg_index,
        teacherId: s.teacher_id,
        teacherName: s.leg_index === 1 ? recipientName : proposerName,
        learnerId: s.learner_id,
        learnerName: s.leg_index === 1 ? proposerName : recipientName,
        skillName: s.leg_index === 1 ? (skillName || 'Skill') : (proposerSkillName || 'Skill'),
        durationMinutes: s.duration_minutes,
        chargedTokens: s.charged_tokens,
        platformFeeTokens: Number(s.platform_fee_tokens),
        teacherPayoutTokens: Number(s.teacher_payout_tokens),
        scheduledStart: s.scheduled_start,
        scheduledEnd: s.scheduled_end,
        meetLink: s.meet_link,
        status: s.status,
        teacherConfirmed: s.teacher_confirmed,
        learnerConfirmed: s.learner_confirmed,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to process offer';
    console.error('Offer API error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
