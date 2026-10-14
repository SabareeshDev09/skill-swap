'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getProfile, getSession, saveProfile, signOut, deriveNameFromEmail, Profile as AuthProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/Navbar';
import { EditSkillsModal } from '@/components/EditSkillsModal';
import { MatchesView } from '@/components/MatchesView';
import { SwapProposalModal } from '@/components/SwapProposalModal';
import { SessionsView } from '@/components/SessionsView';
import { SwapsView } from '@/components/SwapsView';
import { WalletModal } from '@/components/WalletModal';
import { AdminPanel } from '@/components/AdminPanel';
import { ReviewModal } from '@/components/ReviewModal';
import { isUserAdmin } from '@/lib/roles';
import { computePeerMatches } from '@/lib/matches';
import { generateQuoteBreakdown } from '@/lib/pricing';
import {
  Profile,
  Wallet,
  Offer,
  SessionLeg,
  ChatMessage,
  PeerMatch,
  LedgerTransaction,
  OfferType,
  UserTeachSkill,
  UserLearnSkill,
} from '@/types';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

interface SupabaseProfileJoin {
  id: string;
  email?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  city?: string;
  country?: string;
  timezone?: string;
  languages?: string[];
  phone_verified?: boolean;
  is_onboarded?: boolean;
  is_accepting_requests?: boolean;
  strikes_count?: number;
  reputation_score?: number;
  availability?: Record<string, string[]>;
}

export default function Dashboard() {
  const router = useRouter();
  const [authProfile, setAuthProfile] = useState<AuthProfile | null>(null);
  const [storedTeachSkills, setStoredTeachSkills] = useState<UserTeachSkill[] | null>(null);
  const [storedLearnSkills, setStoredLearnSkills] = useState<UserLearnSkill[] | null>(null);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [userId, setUserId] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [isReady, setIsReady] = useState(false);

  // Global Platform State
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [wallet, setWallet] = useState<Wallet>({
    userId: '',
    availablePaise: 0,
    heldPaise: 0,
    lifetimeEarnedPaise: 0,
    lifetimeSpentPaise: 0,
  });
  const [offers, setOffers] = useState<Offer[]>([]);
  const [sessions, setSessions] = useState<SessionLeg[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);

  // UI Navigation State
  const [activeTab, setActiveTab] = useState<'matches' | 'sessions' | 'chat' | 'admin'>('matches');
  const [selectedSwapId, setSelectedSwapId] = useState<string | null>(null);
  const [selectedMatchForModal, setSelectedMatchForModal] = useState<PeerMatch | null>(null);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isEditSkillsOpen, setIsEditSkillsOpen] = useState(false);
  const [sessionForReview, setSessionForReview] = useState<SessionLeg | null>(null);

  // Synchronize live wallet balance and transactions from Supabase
  useEffect(() => {
    if (!userId) return;

    fetch('/api/wallet/balance')
      .then((res) => res.json())
      .then((data) => {
        if (data.wallet) {
          setWallet(data.wallet);
        }
        if (data.transactions && data.transactions.length > 0) {
          setTransactions(data.transactions);
        }
      })
      .catch((err) => console.error('Error fetching live wallet:', err));

    fetch('/api/offers')
      .then((res) => res.json())
      .then((data) => {
        if (data.offers && data.offers.length > 0) {
          setOffers((prev) => {
            const incoming = data.offers.filter((o: Offer) => !prev.some((p) => p.id === o.id));
            return [...incoming, ...prev];
          });
        }
        if (data.sessions && data.sessions.length > 0) {
          setSessions((prev) => {
            const incoming = data.sessions.filter((s: SessionLeg) => !prev.some((p) => p.id === s.id));
            return [...incoming, ...prev];
          });
        }
      })
      .catch((err) => console.error('Error fetching live offers:', err));
  }, [userId]);

  // Fetch real peer profiles and canonical skill records from the server.
  useEffect(() => {
    if (!isReady || !userId) return;
    let cancelled = false;
    fetch('/api/peers')
      .then(async (response) => {
        if (!response.ok) throw new Error('Peer lookup failed');
        return response.json() as Promise<{ peers: Profile[] }>;
      })
      .then(({ peers }) => {
        if (!cancelled) setTeachers(peers);
      })
      .catch((error: unknown) => console.error('Error fetching peers:', error));
    return () => {
      cancelled = true;
    };
  }, [isReady, userId]);

  // Supabase Realtime Broadcast for E2E Testing
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('skillswap-events');

    channel
      .on('broadcast', { event: 'new_offer' }, (payload) => {
        setOffers((prev) => {
          if (prev.some(o => o.id === payload.payload.offer.id)) return prev;
          return [payload.payload.offer, ...prev];
        });
        setSessions((prev) => {
          const incomingSessions = payload.payload.sessions;
          const newSessions = incomingSessions.filter((s: SessionLeg) => !prev.some(ps => ps.id === s.id));
          return [...newSessions, ...prev];
        });
      })
      .on('broadcast', { event: 'new_message' }, (payload) => {
        setChatMessages((prev) => {
          if (prev.some(m => m.id === payload.payload.message.id)) return prev;
          return [...prev, payload.payload.message];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Authenticate and fetch onboarding profile
  useEffect(() => {
    const initAuth = async () => {
      const session = DEMO_MODE ? getSession() : null;
      const supabase = createClient();
      let authenticatedUserId: string | null = null;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          authenticatedUserId = user.id;
          setUserId(user.id);
          setAuthEmail(user.email || '');
          const adminResponse = await fetch('/api/admin/access');
          setHasAdminAccess(adminResponse.ok);
        }
      } catch {
        // ignore
      }

      if (!authenticatedUserId && !DEMO_MODE) {
        signOut();
        router.replace('/login');
        return;
      }

      if (!authenticatedUserId && !session) {
        router.replace('/login');
        return;
      }

      let profile = DEMO_MODE ? getProfile() : null;
      if (!profile) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: dbProfileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', user.id)
              .single();

            const dbProfile = dbProfileData as unknown as SupabaseProfileJoin;

            if (dbProfile && dbProfile.is_onboarded) {
              const [teachRes, learnRes] = await Promise.all([
                supabase.from('user_skills_teach').select('skill_id, level, hourly_rate, years_experience, allowed_durations, skill_taxonomy(id, name, category)').eq('user_id', user.id),
                supabase.from('user_skills_learn').select('skill_id, target_level, goal, skill_taxonomy(id, name, category)').eq('user_id', user.id),
              ]);
              const teachRows = (teachRes.data || []) as unknown as Array<{
                skill_id: string;
                level: 'beginner' | 'intermediate' | 'advanced' | 'expert' | null;
                hourly_rate: number;
                years_experience: number | null;
                allowed_durations: number[] | null;
                skill_taxonomy: { id?: string; name?: string; category?: string } | null;
              }>;
              const learnRows = (learnRes.data || []) as unknown as Array<{
                skill_id: string;
                goal: string | null;
                target_level: 'beginner' | 'intermediate' | 'advanced' | 'expert' | null;
                skill_taxonomy: { id?: string; name?: string; category?: string } | null;
              }>;
              const teachSkills: UserTeachSkill[] = teachRows.flatMap((skill) => {
                const taxonomy = skill.skill_taxonomy;
                if (!taxonomy?.id || !taxonomy.name || !taxonomy.category) return [];
                return [{
                  skillId: skill.skill_id,
                  skillName: taxonomy.name,
                  category: taxonomy.category,
                  level: skill.level || 'intermediate',
                  yearsExperience: Number(skill.years_experience ?? 1),
                  hourlyRate: skill.hourly_rate,
                  allowedDurations: skill.allowed_durations || [],
                }];
              });
              const learnSkills: UserLearnSkill[] = learnRows.flatMap((skill) => {
                const taxonomy = skill.skill_taxonomy;
                if (!taxonomy?.id || !taxonomy.name || !taxonomy.category) return [];
                return [{
                  skillId: skill.skill_id,
                  skillName: taxonomy.name,
                  category: taxonomy.category,
                  targetLevel: skill.target_level || 'beginner',
                  goal: skill.goal || undefined,
                }];
              });
              setStoredTeachSkills(teachSkills);
              setStoredLearnSkills(learnSkills);
              const teachNames = teachSkills.map((skill) => skill.skillName);
              const learnNames = learnSkills.map((skill) => skill.skillName);

              profile = {
                name: dbProfile.full_name || deriveNameFromEmail(user.email) || 'Member',
                avatar: dbProfile.avatar_url || '',
                sex: 'other',
                dob: '1998-01-01',
                teach: teachNames,
                noTeach: teachNames.length === 0,
                learn: learnNames,
                bio: dbProfile.bio || '',
                city: dbProfile.city || '',
                country: dbProfile.country || '',
                timezone: dbProfile.timezone || 'Asia/Kolkata',
                languages: dbProfile.languages || ['English'],
                availability: dbProfile.availability || {},
                hourlyRate: teachRows[0]?.hourly_rate,
                experienceYears: teachRows[0]?.years_experience ?? undefined,
                allowedDurations: teachRows[0]?.allowed_durations || undefined,
                teachLevel: teachRows[0]?.level || undefined,
                learnLevel: learnRows[0]?.target_level || undefined,
              };
            }
          }
        } catch {
          // ignore
        }
      }

      if (!profile) {
        router.replace('/onboarding');
        return;
      }

      try {
        if (authenticatedUserId) {
        const { data: persistedProfile } = await supabase
          .from('profiles')
          .select('timezone, languages, availability')
          .eq('id', authenticatedUserId)
          .maybeSingle();
        const { data: persistedTeachSkills } = await supabase
          .from('user_skills_teach')
          .select('level, hourly_rate, years_experience, allowed_durations')
          .eq('user_id', authenticatedUserId)
          .order('created_at', { ascending: true })
          .limit(1);
        const persistedTeachSkill = persistedTeachSkills?.[0];
        profile = {
          ...profile,
          timezone: persistedProfile?.timezone || profile.timezone,
          languages: persistedProfile?.languages || profile.languages,
          availability: persistedProfile?.availability || profile.availability || {},
          hourlyRate: persistedTeachSkill?.hourly_rate ?? profile.hourlyRate,
          experienceYears: persistedTeachSkill?.years_experience ?? profile.experienceYears,
          allowedDurations: persistedTeachSkill?.allowed_durations || profile.allowedDurations,
          teachLevel: persistedTeachSkill?.level || profile.teachLevel,
        };
        }
      } catch {
        // Use the locally saved profile when persisted profile data is unavailable.
      }

      setAuthProfile(profile);
      setIsReady(true);
    };

    initAuth();
  }, [router, userId]);

  // Bridge AuthProfile into the platform Profile type
  const currentUser: Profile = useMemo(() => {
    if (!authProfile) {
      return {
        id: userId,
        email: authEmail,
        fullName: deriveNameFromEmail(authEmail) || 'Member',
        avatarUrl: '/avatars/avatar_1.jpg',
        bio: 'SkillSwap member',
        city: 'Bengaluru',
        country: 'IN',
        timezone: 'Asia/Kolkata',
        languages: ['English'],
        phoneVerified: true,
        isOnboarded: true,
        isAcceptingRequests: true,
        strikesCount: 0,
        reputationScore: 5.0,
        completedSessionsCount: 0,
        teachSkills: [],
        learnSkills: [],
        availability: {},
      };
    }

    // Map teaching skills from onboarding/profile
    const hourlyRate = authProfile.hourlyRate ?? 0;
    const experienceYears = authProfile.experienceYears ?? 0;
    const allowedDurations = authProfile.allowedDurations || [];

    const fallbackTeachSkills: UserTeachSkill[] = authProfile.noTeach
      ? []
      : authProfile.teach.map((skillName, index) => ({
          skillId: `sk-teach-${index}`,
          skillName,
          category: 'Skill Exchange',
          level: authProfile.teachLevel || 'intermediate',
          yearsExperience: experienceYears,
          hourlyRate: hourlyRate,
          allowedDurations: allowedDurations,
          isVerified: true,
        }));

    // Map learning skills from onboarding/profile
    const fallbackLearnSkills: UserLearnSkill[] = authProfile.learn.map((skillName, index) => ({
      skillId: `sk-learn-${index}`,
      skillName,
      category: 'Skill Exchange',
      targetLevel: authProfile.learnLevel || 'beginner',
      goal: `Learn ${skillName} from vetted peers`,
    }));
    const teachSkills = storedTeachSkills ?? fallbackTeachSkills;
    const learnSkills = storedLearnSkills ?? fallbackLearnSkills;

    return {
      id: userId,
      email: authEmail,
      fullName: authProfile.name || deriveNameFromEmail(authEmail) || 'Member',
      avatarUrl:
        authProfile.avatar ||
        '/avatars/avatar_5.jpg',
      bio: authProfile.bio || (authProfile.headline ? `${authProfile.headline}. Trading: ${authProfile.teach.join(', ') || 'Learner'}` : `SkillSwap member trading skills: ${authProfile.teach.join(', ') || 'Learner'}`),
      city: authProfile.city || 'Bengaluru',
      country: authProfile.country || 'IN',
      timezone: authProfile.timezone || 'Asia/Kolkata',
      languages: authProfile.languages || ['English', 'Hindi'],
      phoneVerified: true,
      isOnboarded: true,
      isAcceptingRequests: authProfile.isAcceptingRequests !== undefined ? authProfile.isAcceptingRequests : true,
      strikesCount: 0,
      reputationScore: 5.0,
      completedSessionsCount: 0,
      teachSkills,
      learnSkills,
      availability: authProfile.availability || {},
      app_metadata: hasAdminAccess ? { role: 'admin' } : null,
    };
  }, [authProfile, storedTeachSkills, storedLearnSkills, userId, authEmail, hasAdminAccess]);

  // Compute live peer matches dynamically based on the onboarded skills
  const peerMatches = useMemo(() => {
    return computePeerMatches(currentUser, teachers);
  }, [currentUser, teachers]);

  const handleSignOut = async () => {
    signOut();
    router.replace('/');
  };

  // Action: Create and submit new offer
  const handleSubmitOffer = async (data: {
    type: OfferType;
    match: PeerMatch;
    proposerTeachSkill?: UserTeachSkill;
    durationMinutes: number;
    message: string;
    chargedTokens: number;
  }) => {
    const quote = generateQuoteBreakdown({
      type: data.type,
      proposerLeg: {
        skillId: data.match.teacherOfferingSkill.skillId,
        skillName: data.match.teacherOfferingSkill.skillName,
        teacherId: data.match.teacher.id,
        learnerId: currentUser.id,
        hourlyRate: data.match.teacherOfferingSkill.hourlyRate,
        durationMinutes: data.durationMinutes,
      },
      recipientLeg:
        data.type === 'SWAP' && data.proposerTeachSkill
          ? {
              skillId: data.proposerTeachSkill.skillId,
              skillName: data.proposerTeachSkill.skillName,
              teacherId: currentUser.id,
              learnerId: data.match.teacher.id,
              hourlyRate: data.proposerTeachSkill.hourlyRate,
              durationMinutes: data.durationMinutes,
            }
          : undefined,
    });

    // 1. Attempt server-side atomic offer creation & escrow hold via API
    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposerName: currentUser.fullName,
          recipientId: data.match.teacher.id,
          recipientName: data.match.teacher.fullName,
          type: data.type,
          quote,
          message: data.message,
          durationMinutes: data.durationMinutes,
          chargedTokens: data.chargedTokens,
          skillName: data.match.teacherOfferingSkill.skillName,
          proposerSkillName: data.proposerTeachSkill?.skillName,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success && resData.offer && resData.sessions) {
        setOffers(prev => [resData.offer, ...prev]);
        setSessions(prev => [...resData.sessions, ...prev]);

        const holdPaise = data.chargedTokens * 100;
        setWallet(prev => ({
          ...prev,
          availablePaise: Math.max(0, prev.availablePaise - holdPaise),
          heldPaise: prev.heldPaise + holdPaise,
        }));

        const newTx: LedgerTransaction = {
          id: `tx-${Date.now().toString().slice(-4)}`,
          referenceId: resData.offer.id,
          type: 'HOLD',
          amountPaise: holdPaise,
          timestamp: 'Just now',
          description: `Escrow hold for ${data.type} proposal with ${data.match.teacher.fullName}`,
          idempotencyKey: `idemp-hold-${resData.offer.id}`,
        };
        setTransactions(prev => [newTx, ...prev]);

        const supabase = createClient();
        supabase.channel('skillswap-events').send({
          type: 'broadcast',
          event: 'new_offer',
          payload: { offer: resData.offer, sessions: resData.sessions },
        });

        setSelectedMatchForModal(null);
        setActiveTab('sessions');
        return;
      }
    } catch (err) {
      console.warn('API offer endpoint fallback to optimistic state:', err);
    }

    if (!DEMO_MODE) return;

    // Fallback: local optimistic state
    const newOfferId = `off-${Date.now().toString().slice(-4)}`;

    const newOffer: Offer = {
      id: newOfferId,
      type: data.type,
      proposerId: currentUser.id,
      proposerName: currentUser.fullName,
      recipientId: data.match.teacher.id,
      recipientName: data.match.teacher.fullName,
      status: 'ACCEPTED', // Simulated acceptance
      message: data.message,
      quote,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
    };

    // 1. Lock skill points into Escrow (Available -> Held)
    const holdPaise = data.chargedTokens * 100;
    setWallet(prev => ({
      ...prev,
      availablePaise: Math.max(0, prev.availablePaise - holdPaise),
      heldPaise: prev.heldPaise + holdPaise,
    }));

    // 2. Ledger transaction
    const newTx: LedgerTransaction = {
      id: `tx-${Date.now().toString().slice(-4)}`,
      referenceId: newOfferId,
      type: 'HOLD',
      amountPaise: holdPaise,
      timestamp: 'Just now',
      description: `Escrow hold for ${data.type} proposal with ${data.match.teacher.fullName}`,
      idempotencyKey: `idemp-hold-${newOfferId}`,
    };
    setTransactions(prev => [newTx, ...prev]);

    // 3. Create Session Legs
    const newSessions: SessionLeg[] = [
      {
        id: `ses-${Date.now().toString().slice(-4)}-1`,
        offerId: newOfferId,
        legIndex: 1,
        teacherId: data.match.teacher.id,
        teacherName: data.match.teacher.fullName,
        learnerId: currentUser.id,
        learnerName: currentUser.fullName,
        skillName: data.match.teacherOfferingSkill.skillName,
        durationMinutes: data.durationMinutes,
        chargedTokens: quote.proposerLeg.chargedTokens,
        platformFeeTokens: quote.proposerLeg.platformFeeTokens,
        teacherPayoutTokens: quote.proposerLeg.teacherPayoutTokens,
        scheduledStart: new Date(Date.now() + 2 * 3600000).toISOString(),
        scheduledEnd: new Date(Date.now() + 3 * 3600000).toISOString(),
        meetLink: 'https://meet.google.com/new',
        status: 'SCHEDULED',
        teacherConfirmed: false,
        learnerConfirmed: false,
      },
    ];

    if (data.type === 'SWAP' && data.proposerTeachSkill && quote.recipientLeg) {
      newSessions.push({
        id: `ses-${Date.now().toString().slice(-4)}-2`,
        offerId: newOfferId,
        legIndex: 2,
        teacherId: currentUser.id,
        teacherName: currentUser.fullName,
        learnerId: data.match.teacher.id,
        learnerName: data.match.teacher.fullName,
        skillName: data.proposerTeachSkill.skillName,
        durationMinutes: data.durationMinutes,
        chargedTokens: quote.recipientLeg.chargedTokens,
        platformFeeTokens: quote.recipientLeg.platformFeeTokens,
        teacherPayoutTokens: quote.recipientLeg.teacherPayoutTokens,
        scheduledStart: new Date(Date.now() + 26 * 3600000).toISOString(),
        scheduledEnd: new Date(Date.now() + 27 * 3600000).toISOString(),
        meetLink: 'https://meet.google.com/new',
        status: 'SCHEDULED',
        teacherConfirmed: false,
        learnerConfirmed: false,
      });
    }

    setOffers(prev => [newOffer, ...prev]);
    setSessions(prev => [...newSessions, ...prev]);
    
    // Broadcast the new offer to other users
    const supabase = createClient();
    supabase.channel('skillswap-events').send({
      type: 'broadcast',
      event: 'new_offer',
      payload: { offer: newOffer, sessions: newSessions },
    });

    setSelectedMatchForModal(null);
    setActiveTab('sessions');
  };

  // Action: Buy Skill Points
  const handleBuyTokens = (tokens: number) => {
    const paise = tokens * 100;
    setWallet(prev => ({
      ...prev,
      availablePaise: prev.availablePaise + paise,
    }));

    const newTx: LedgerTransaction = {
      id: `tx-${Date.now().toString().slice(-4)}`,
      referenceId: `pay-rzp-${Date.now().toString().slice(-4)}`,
      type: 'PURCHASE',
      amountPaise: paise,
      timestamp: 'Just now',
      description: `Razorpay UPI purchase (${tokens} SP)`,
      idempotencyKey: `idemp-buy-${Date.now()}`,
    };
    setTransactions(prev => [newTx, ...prev]);
  };

  // Action: Confirm session completion & release escrow (Dual Sign-off)
  const handleConfirmSession = async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const isTeacher = session.teacherId === currentUser.id;
    const isLearner = session.learnerId === currentUser.id;

    // Call server-side dual sign-off API
    try {
      const res = await fetch('/api/sessions/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        if (resData.settled) {
          const chargedPaise = session.chargedTokens * 100;
          const payoutPaise = Math.round(session.teacherPayoutTokens * 100);
          setWallet(prev => ({
            ...prev,
            heldPaise: Math.max(0, prev.heldPaise - chargedPaise),
            availablePaise: isTeacher ? prev.availablePaise + payoutPaise : prev.availablePaise,
          }));
          const settledSession: SessionLeg = {
            ...session,
            status: 'SETTLED',
            teacherConfirmed: true,
            learnerConfirmed: true,
          };
          setSessions(prev =>
            prev.map(s =>
              s.id === sessionId
                ? settledSession
                : s
            )
          );
          setSessionForReview(settledSession);
        } else {
          setSessions(prev =>
            prev.map(s =>
              s.id === sessionId
                ? {
                    ...s,
                    teacherConfirmed: isTeacher ? true : s.teacherConfirmed,
                    learnerConfirmed: isLearner ? true : s.learnerConfirmed,
                  }
                : s
            )
          );
        }
        return;
      }
    } catch (err) {
      console.warn('API session confirm failed, falling back to local state:', err);
    }

    if (!DEMO_MODE) return;

    const updatedTeacherConfirmed = isTeacher ? true : (session.teacherConfirmed || false);
    const updatedLearnerConfirmed = isLearner ? true : (session.learnerConfirmed || false);

    // If both parties haven't confirmed yet, only mark the current user's confirmation
    if (!updatedTeacherConfirmed || !updatedLearnerConfirmed) {
      setSessions(prev =>
        prev.map(s =>
          s.id === sessionId
            ? {
                ...s,
                teacherConfirmed: updatedTeacherConfirmed,
                learnerConfirmed: updatedLearnerConfirmed,
              }
            : s
        )
      );
      return;
    }

    // Both parties have confirmed: complete the session and release escrow
    const chargedPaise = session.chargedTokens * 100;
    const feePaise = session.platformFeeTokens * 100;
    const payoutPaise = session.teacherPayoutTokens * 100;

    // 1. Release held escrow: subtract from held
    // 2. If current user is the teacher, credit their available balance with the payout
    setWallet(prev => ({
      ...prev,
      heldPaise: Math.max(0, prev.heldPaise - chargedPaise),
      availablePaise: isTeacher ? prev.availablePaise + payoutPaise : prev.availablePaise,
    }));

    // 3. Mark session as SETTLED
    const settledSession: SessionLeg = {
      ...session,
      status: 'SETTLED',
      teacherConfirmed: true,
      learnerConfirmed: true,
    };

    setSessions(prev =>
      prev.map(s =>
        s.id === sessionId
          ? settledSession
          : s
      )
    );

    const releaseTx: LedgerTransaction = {
      id: `tx-${Date.now().toString().slice(-4)}-rel`,
      referenceId: session.id,
      type: 'RELEASE',
      amountPaise: payoutPaise,
      timestamp: 'Just now',
      description: `Escrow payout released to ${session.teacherName} for ${session.skillName}`,
      idempotencyKey: `idemp-rel-${session.id}`,
    };

    const feeTx: LedgerTransaction = {
      id: `tx-${Date.now().toString().slice(-4)}-fee`,
      referenceId: session.id,
      type: 'FEE',
      amountPaise: feePaise,
      timestamp: 'Just now',
      description: `SkillSwap 10% platform fee retained on session ${session.id.substring(0, 8)}`,
      idempotencyKey: `idemp-fee-${session.id}`,
    };

    setTransactions(prev => [releaseTx, feeTx, ...prev]);
    setSessionForReview(settledSession);
  };

  // Action: Dispute a session
  const handleDisputeSession = async (sessionId: string, reason: string) => {
    let persisted = false;
    try {
      const response = await fetch('/api/sessions/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          reason,
        }),
      });
      persisted = response.ok;
    } catch (err) {
      console.warn('API dispute failed, updating local state:', err);
    }

    if (!persisted && !DEMO_MODE) return;

    setSessions(prev =>
      prev.map(s => (s.id === sessionId ? { ...s, status: 'DISPUTED', disputeReason: reason } : s))
    );
  };

  // Action: Admin resolves dispute
  const handleResolveDispute = async (sessionId: string, resolution: 'REFUND' | 'RELEASE' | 'SPLIT') => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    let persisted = false;
    try {
      const response = await fetch('/api/admin/dispute/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          resolution,
        }),
      });
      persisted = response.ok;
    } catch (err) {
      console.warn('Admin dispute API fallback:', err);
    }

    if (!persisted && !DEMO_MODE) return;

    const chargedPaise = session.chargedTokens * 100;

    if (resolution === 'REFUND') {
      setWallet(prev => ({
        ...prev,
        heldPaise: Math.max(0, prev.heldPaise - chargedPaise),
        availablePaise: prev.availablePaise + chargedPaise,
      }));
    } else if (resolution === 'RELEASE') {
      handleConfirmSession(sessionId);
      return;
    } else {
      const halfPaise = Math.round(chargedPaise / 2);
      setWallet(prev => ({
        ...prev,
        heldPaise: Math.max(0, prev.heldPaise - chargedPaise),
        availablePaise: prev.availablePaise + halfPaise,
      }));
    }

    setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, status: 'SETTLED' } : s)));
  };

  // Action: Chat Messages
  const handleSendMessage = async (
    content: string,
    type: 'TEXT' | 'PROPOSE_TIME' = 'TEXT',
    metadata?: Record<string, unknown>,
    targetOfferId?: string
  ) => {
    const threadId = targetOfferId || selectedSwapId || offers[0]?.id || 'direct-thread';
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      threadId,
      senderId: currentUser.id,
      senderName: currentUser.fullName,
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type,
      metadata,
    };
    setChatMessages(prev => [...prev, newMsg]);

    try {
      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: threadId,
          threadId,
          senderId: currentUser.id,
          content,
          messageType: type,
          metadata,
        }),
      });
    } catch (err) {
      console.warn('Chat persistence API error, relying on local/broadcast:', err);
    }

    const supabase = createClient();
    supabase.channel('skillswap-events').send({
      type: 'broadcast',
      event: 'new_message',
      payload: { message: newMsg },
    });
  };

  const handleAcceptProposedTime = (messageId: string, meetLink: string) => {
    const targetMsg = chatMessages.find(m => m.id === messageId);
    const threadId = targetMsg?.threadId || selectedSwapId || offers[0]?.id || 'direct-thread';

    const confirmMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      threadId,
      senderId: currentUser.id,
      senderName: currentUser.fullName,
      content: 'Time slot accepted! Google Meet link generated and calendar invitations coordinated.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'TIME_CONFIRMED',
      metadata: { meetLink },
    };

    setChatMessages(prev =>
      prev
        .map(m => (m.id === messageId ? { ...m, metadata: { ...m.metadata, accepted: true, meetLink } } : m))
        .concat(confirmMsg)
    );

    const supabase = createClient();
    supabase.channel('skillswap-events').send({
      type: 'broadcast',
      event: 'new_message',
      payload: { message: confirmMsg },
    });
  };

  const handleAcceptOffer = async (offerId: string) => {
    try {
      const res = await fetch('/api/offers/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId, action: 'ACCEPT' }),
      });
      if (res.ok) {
        setOffers(prev => prev.map(o => (o.id === offerId ? { ...o, status: 'ACCEPTED' } : o)));
      }
    } catch (err) {
      console.warn('Accept offer error, using optimistic update:', err);
    }
    setOffers(prev => prev.map(o => (o.id === offerId ? { ...o, status: 'ACCEPTED' } : o)));
  };

  const handleDeclineOffer = async (offerId: string) => {
    try {
      const res = await fetch('/api/offers/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId, action: 'DECLINE' }),
      });
      if (res.ok) {
        setOffers(prev => prev.map(o => (o.id === offerId ? { ...o, status: 'DECLINED' } : o)));
      }
    } catch (err) {
      console.warn('Decline offer error, using optimistic update:', err);
    }
    setOffers(prev => prev.map(o => (o.id === offerId ? { ...o, status: 'DECLINED' } : o)));
  };

  if (!isReady || !authProfile) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-zinc-400 font-mono text-sm">
        Authenticating session & loading peer matches...
      </div>
    );
  }

  return (
    <Navbar
      currentUser={currentUser}
      wallet={wallet}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onOpenWallet={() => setIsWalletOpen(true)}
      onOpenOnboarding={() => router.push('/profile')}
      onOpenProfile={() => router.push('/profile')}
      onOpenEditSkills={() => setIsEditSkillsOpen(true)}
      onSignOut={handleSignOut}
      pendingOffersCount={offers.filter(o => o.status === 'PENDING').length}
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">

      {/* Main Tab Views */}
        {activeTab === 'matches' && (
          <MatchesView
            matches={peerMatches}
            onSelectMatch={match => setSelectedMatchForModal(match)}
            onOpenEditSkills={() => setIsEditSkillsOpen(true)}
            currentUser={currentUser}
            sessions={sessions}
          />
        )}

        {activeTab === 'sessions' && (
          <SessionsView
            sessions={sessions}
            offers={offers}
            currentUser={currentUser}
            onConfirmSession={handleConfirmSession}
            onOpenChat={(offerId) => {
              setSelectedSwapId(offerId);
              setActiveTab('chat');
            }}
            onDisputeSession={handleDisputeSession}
            onOpenReview={session => setSessionForReview(session)}
          />
        )}

        {activeTab === 'chat' && (
          <SwapsView
            currentUser={currentUser}
            offers={offers}
            sessions={sessions}
            chatMessages={chatMessages}
            onSendMessage={handleSendMessage}
            onAcceptProposedTime={handleAcceptProposedTime}
            onAcceptOffer={handleAcceptOffer}
            onDeclineOffer={handleDeclineOffer}
            onDisputeSession={handleDisputeSession}
            onNavigateToDiscover={() => setActiveTab('matches')}
            selectedSwapId={selectedSwapId}
            onSelectSwapId={setSelectedSwapId}
          />
        )}

        {activeTab === 'admin' && isUserAdmin(currentUser) && (
          <AdminPanel sessions={sessions} onResolveDispute={handleResolveDispute} />
        )}

      {/* Interactive Swap Proposal Modal */}
      {selectedMatchForModal && (
        <SwapProposalModal
          match={selectedMatchForModal}
          currentUser={currentUser}
          wallet={wallet}
          isOpen={!!selectedMatchForModal}
          onClose={() => setSelectedMatchForModal(null)}
          onSubmitOffer={handleSubmitOffer}
          onOpenWallet={() => {
            setSelectedMatchForModal(null);
            setIsWalletOpen(true);
          }}
        />
      )}

      {/* Edit Skills Modal */}
      <EditSkillsModal
        isOpen={isEditSkillsOpen}
        onClose={() => setIsEditSkillsOpen(false)}
        profile={authProfile}
        onSave={async (updatedProfile) => {
          await saveProfile(updatedProfile);
          const supabase = createClient();
          const [teachRes, learnRes] = await Promise.all([
            supabase.from('user_skills_teach').select('skill_id, level, hourly_rate, years_experience, allowed_durations, skill_taxonomy(id, name, category)').eq('user_id', userId),
            supabase.from('user_skills_learn').select('skill_id, target_level, goal, skill_taxonomy(id, name, category)').eq('user_id', userId),
          ]);
          if (teachRes.error || learnRes.error) {
            throw new Error('Skills saved, but the updated matching profile could not be refreshed.');
          }
          const teachRows = (teachRes.data || []) as unknown as Array<{
            skill_id: string;
            level: UserTeachSkill['level'] | null;
            hourly_rate: number;
            years_experience: number | null;
            allowed_durations: number[] | null;
            skill_taxonomy: { name?: string; category?: string } | null;
          }>;
          const learnRows = (learnRes.data || []) as unknown as Array<{
            skill_id: string;
            target_level: UserLearnSkill['targetLevel'] | null;
            goal: string | null;
            skill_taxonomy: { name?: string; category?: string } | null;
          }>;
          setStoredTeachSkills(teachRows.flatMap((skill) => {
            const taxonomy = skill.skill_taxonomy;
            if (!taxonomy?.name || !taxonomy.category) return [];
            return [{
              skillId: skill.skill_id,
              skillName: taxonomy.name,
              category: taxonomy.category,
              level: skill.level || 'intermediate',
              yearsExperience: Number(skill.years_experience ?? 1),
              hourlyRate: skill.hourly_rate,
              allowedDurations: skill.allowed_durations || [],
            }];
          }));
          setStoredLearnSkills(learnRows.flatMap((skill) => {
            const taxonomy = skill.skill_taxonomy;
            if (!taxonomy?.name || !taxonomy.category) return [];
            return [{
              skillId: skill.skill_id,
              skillName: taxonomy.name,
              category: taxonomy.category,
              targetLevel: skill.target_level || 'beginner',
              goal: skill.goal || undefined,
            }];
          }));
          setAuthProfile(updatedProfile);
        }}
      />

      {/* Wallet Checkout Modal */}
      <WalletModal
        currentUser={currentUser}
        wallet={wallet}
        transactions={transactions}
        isOpen={isWalletOpen}
        onClose={() => setIsWalletOpen(false)}
        onBuyTokens={handleBuyTokens}
      />

      {/* Double-Blind Review Modal (PRD §7.10) */}
      {sessionForReview && (
        <ReviewModal
          session={sessionForReview}
          isOpen={!!sessionForReview}
          onClose={() => setSessionForReview(null)}
          onSubmitReview={async (sessionId, rating, feedback, tags) => {
            try {
              await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionId,
                  rating,
                  feedback,
                  tags,
                }),
              });
            } catch (err) {
              console.warn('Failed to save review to backend:', err);
            }
            setSessionForReview(null);
          }}
        />
      )}
      </div>
    </Navbar>
  );
}
