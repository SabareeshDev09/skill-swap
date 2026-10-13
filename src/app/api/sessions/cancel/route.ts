import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/auth/server';

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (user instanceof NextResponse) return user;

    const { sessionId, reason } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing required cancellation parameters' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { data: session, error: sessionError } = await admin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'CANCELLED') {
      return NextResponse.json({ success: true, idempotent: true, session });
    }

    if (session.status !== 'SCHEDULED' && session.status !== 'PENDING_CONFIRMATION') {
      return NextResponse.json({ error: `Cannot cancel session with status ${session.status}` }, { status: 400 });
    }

    const isTeacher = session.teacher_id === user.id;
    const isLearner = session.learner_id === user.id;

    if (!isTeacher && !isLearner) {
      return NextResponse.json({ error: 'Unauthorized to cancel this session' }, { status: 403 });
    }

    const chargedPaise = Number(session.charged_tokens) * 100;
    const teacherPayoutPaise = Math.round(Number(session.teacher_payout_tokens) * 100);

    const { data: learnerWallet, error: learnerWalletError } = await admin
      .from('wallets')
      .select('*')
      .eq('user_id', session.learner_id)
      .single();

    const { data: teacherWallet, error: teacherWalletError } = await admin
      .from('wallets')
      .select('*')
      .eq('user_id', session.teacher_id)
      .single();

    if (learnerWalletError || !learnerWallet) {
      return NextResponse.json({ error: 'Learner wallet could not be verified' }, { status: 409 });
    }

    const now = Date.now();
    const scheduledStartTime = session.scheduled_start ? new Date(session.scheduled_start).getTime() : now;
    const hoursUntilSession = (scheduledStartTime - now) / (1000 * 60 * 60);

    if (isTeacher) {
      if ((learnerWallet.held_paise ?? 0) < chargedPaise) {
        return NextResponse.json({ error: 'Insufficient held funds to cancel this session' }, { status: 409 });
      }

      await admin
        .from('wallets')
        .update({
          held_paise: Math.max(0, learnerWallet.held_paise - chargedPaise),
          available_paise: learnerWallet.available_paise + chargedPaise,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', session.learner_id);

      const { data: teacherProfile } = await admin
        .from('profiles')
        .select('strikes_count')
        .eq('id', session.teacher_id)
        .single();

      const newStrikes = (teacherProfile?.strikes_count || 0) + 1;
      await admin
        .from('profiles')
        .update({ strikes_count: newStrikes })
        .eq('id', session.teacher_id);

      await admin.from('ledger_transactions').insert({
        reference_id: session.id,
        transaction_type: 'REFUND',
        source_wallet_id: session.learner_id,
        dest_wallet_id: session.learner_id,
        amount_paise: chargedPaise,
        idempotency_key: `idemp-cancel-t-${session.id}`,
        metadata: {
          cancelledBy: 'teacher',
          reason: reason || 'Teacher cancelled session',
          strikesApplied: 1,
        },
      });
    } else {
      if (hoursUntilSession >= 24) {
        if ((learnerWallet.held_paise ?? 0) < chargedPaise) {
          return NextResponse.json({ error: 'Insufficient held funds to cancel this session' }, { status: 409 });
        }

        await admin
          .from('wallets')
          .update({
            held_paise: Math.max(0, learnerWallet.held_paise - chargedPaise),
            available_paise: learnerWallet.available_paise + chargedPaise,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', session.learner_id);

        await admin.from('ledger_transactions').insert({
          reference_id: session.id,
          transaction_type: 'REFUND',
          source_wallet_id: session.learner_id,
          dest_wallet_id: session.learner_id,
          amount_paise: chargedPaise,
          idempotency_key: `idemp-cancel-l24-${session.id}`,
          metadata: {
            cancelledBy: 'learner',
            noticeHours: hoursUntilSession.toFixed(1),
            reason: reason || 'Learner cancelled >24h notice',
          },
        });
      } else {
        const halfCharged = Math.round(chargedPaise / 2);
        const halfTeacherPayout = Math.round(teacherPayoutPaise / 2);

        if ((learnerWallet.held_paise ?? 0) < chargedPaise) {
          return NextResponse.json({ error: 'Insufficient held funds to cancel this session' }, { status: 409 });
        }

        await admin
          .from('wallets')
          .update({
            held_paise: Math.max(0, learnerWallet.held_paise - chargedPaise),
            available_paise: learnerWallet.available_paise + halfCharged,
            lifetime_spent_paise: (learnerWallet.lifetime_spent_paise || 0) + halfCharged,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', session.learner_id);

        if (teacherWallet && !teacherWalletError) {
          await admin
            .from('wallets')
            .update({
              available_paise: teacherWallet.available_paise + halfTeacherPayout,
              lifetime_earned_paise: (teacherWallet.lifetime_earned_paise || 0) + halfTeacherPayout,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', session.teacher_id);
        }

        await admin.from('ledger_transactions').insert({
          reference_id: session.id,
          transaction_type: 'REFUND',
          source_wallet_id: session.learner_id,
          dest_wallet_id: session.learner_id,
          amount_paise: halfCharged,
          idempotency_key: `idemp-cancel-split-learn-${session.id}`,
          metadata: {
            cancelledBy: 'learner',
            noticeHours: hoursUntilSession.toFixed(1),
            latePolicy: '50% refund',
          },
        });

        await admin.from('ledger_transactions').insert({
          reference_id: session.id,
          transaction_type: 'RELEASE',
          source_wallet_id: session.learner_id,
          dest_wallet_id: session.teacher_id,
          amount_paise: halfTeacherPayout,
          idempotency_key: `idemp-cancel-split-teach-${session.id}`,
          metadata: {
            cancelledBy: 'learner',
            latePolicy: '50% teacher compensation',
          },
        });
      }
    }

    const { data: updatedSession } = await admin
      .from('sessions')
      .update({
        status: 'CANCELLED',
        dispute_reason: `Cancelled by ${isTeacher ? 'Teacher' : 'Learner'}: ${reason || 'User cancelled'}`,
      })
      .eq('id', session.id)
      .select()
      .single();

    return NextResponse.json({
      success: true,
      session: updatedSession,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to cancel session';
    console.error('Session cancel error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
