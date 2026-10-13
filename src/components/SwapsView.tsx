'use client';

import React, { useState, useMemo } from 'react';
import {
  ArrowRightLeft,
  Calendar,
  Clock,
  Video,
  ExternalLink,
  ShieldCheck,
  Check,
  X,
  Send,
  AlertTriangle,
  Search,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  CalendarDays,
  TrendingDown,
} from 'lucide-react';
import { Offer, SessionLeg, ChatMessage, Profile } from '@/types';

export interface UnifiedSwap {
  id: string; // offerId or session id
  offer?: Offer;
  partnerId: string;
  partnerName: string;
  partnerAvatar?: string;
  partnerRole: 'PROPOSER' | 'RECIPIENT' | 'PEER';
  isIncomingProposal: boolean;
  type: 'SWAP' | 'DIRECT';
  status: 'PENDING' | 'ACCEPTED' | 'SCHEDULED' | 'COMPLETED' | 'DISPUTED' | 'DECLINED' | 'CANCELLED';
  myRole: 'TEACHER' | 'LEARNER' | 'MUTUAL';
  mySkillName: string;
  partnerSkillName: string;
  escrowTokens: number;
  savingsPct?: number;
  sessions: SessionLeg[];
  createdAt: string;
}

interface SwapsViewProps {
  currentUser: Profile;
  offers: Offer[];
  sessions: SessionLeg[];
  chatMessages: ChatMessage[];
  onSendMessage: (
    content: string,
    type?: 'TEXT' | 'PROPOSE_TIME',
    metadata?: Record<string, unknown>,
    targetThreadId?: string
  ) => void;
  onAcceptProposedTime: (messageId: string, meetLink: string) => void;
  onAcceptOffer?: (offerId: string) => Promise<void> | void;
  onDeclineOffer?: (offerId: string) => Promise<void> | void;
  onDisputeSession?: (sessionId: string, reason: string) => void;
  onNavigateToDiscover: () => void;
  selectedSwapId?: string | null;
  onSelectSwapId?: (id: string | null) => void;
}

export const SwapsView: React.FC<SwapsViewProps> = ({
  currentUser,
  offers,
  sessions,
  chatMessages,
  onSendMessage,
  onAcceptProposedTime,
  onAcceptOffer,
  onDeclineOffer,
  onNavigateToDiscover,
  selectedSwapId: controlledSelectedSwapId,
  onSelectSwapId,
}) => {
  const [internalSelectedSwapId, setInternalSelectedSwapId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'COMPLETED'>('ALL');
  const [inputText, setInputText] = useState('');
  const [offPlatformWarning, setOffPlatformWarning] = useState<string | null>(null);

  // Propose modal state
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [proposedLegIndex, setProposedLegIndex] = useState(1);
  const [proposedDate, setProposedDate] = useState('Tomorrow');
  const [proposedTime, setProposedTime] = useState('18:00 - 19:00 IST');
  const [isProposing, setIsProposing] = useState(false);

  // Derive Unified Swaps from real offers and sessions
  const unifiedSwaps: UnifiedSwap[] = useMemo(() => {
    const list: UnifiedSwap[] = [];
    const processedOfferIds = new Set<string>();

    // 1. Process all real offers
    for (const offer of offers) {
      processedOfferIds.add(offer.id);
      const isProposer = offer.proposerId === currentUser.id;
      const isRecipient = offer.recipientId === currentUser.id;
      const isIncoming = isRecipient && offer.status === 'PENDING';

      const partnerId = isProposer ? offer.recipientId : offer.proposerId;
      const partnerName = isProposer ? offer.recipientName : offer.proposerName;
      const partnerRole = isProposer ? 'RECIPIENT' : 'PROPOSER';

      const relatedSessions = sessions.filter(s => s.offerId === offer.id);

      // Determine skills
      let mySkill = '';
      let partnerSkill = '';
      let myRole: 'TEACHER' | 'LEARNER' | 'MUTUAL' = 'MUTUAL';

      if (offer.type === 'SWAP') {
        myRole = 'MUTUAL';
        if (isProposer) {
          partnerSkill = offer.quote.proposerLeg.skillName; // what proposer learns
          mySkill = offer.quote.recipientLeg?.skillName || 'Your skill'; // what proposer teaches
        } else {
          mySkill = offer.quote.proposerLeg.skillName;
          partnerSkill = offer.quote.recipientLeg?.skillName || 'Partner skill';
        }
      } else {
        // DIRECT offer
        if (isProposer) {
          myRole = 'LEARNER';
          partnerSkill = offer.quote.proposerLeg.skillName;
          mySkill = 'Tokens (Escrow)';
        } else {
          myRole = 'TEACHER';
          mySkill = offer.quote.proposerLeg.skillName;
          partnerSkill = 'Tokens (Escrow)';
        }
      }

      // Determine unified status
      let unifiedStatus: UnifiedSwap['status'] = 'PENDING';
      if (offer.status === 'PENDING') {
        unifiedStatus = 'PENDING';
      } else if (offer.status === 'DECLINED') {
        unifiedStatus = 'DECLINED';
      } else if (offer.status === 'CANCELLED') {
        unifiedStatus = 'CANCELLED';
      } else if (relatedSessions.some(s => s.status === 'DISPUTED')) {
        unifiedStatus = 'DISPUTED';
      } else if (relatedSessions.length > 0 && relatedSessions.every(s => s.status === 'SETTLED')) {
        unifiedStatus = 'COMPLETED';
      } else if (relatedSessions.some(s => s.status === 'SCHEDULED' || s.status === 'PENDING_CONFIRMATION')) {
        unifiedStatus = 'SCHEDULED';
      } else {
        unifiedStatus = 'ACCEPTED';
      }

      const escrowTokens = offer.quote?.proposerLeg?.chargedTokens || 0;

      list.push({
        id: offer.id,
        offer,
        partnerId,
        partnerName: partnerName || 'Swap Peer',
        partnerRole,
        isIncomingProposal: isIncoming,
        type: offer.type,
        status: unifiedStatus,
        myRole,
        mySkillName: mySkill,
        partnerSkillName: partnerSkill,
        escrowTokens,
        savingsPct: offer.quote?.proposerSavingsPct || 70,
        sessions: relatedSessions,
        createdAt: offer.createdAt,
      });
    }

    // 2. Process sessions that might not have a matching offer in state
    const orphanSessionsByOfferId: Record<string, SessionLeg[]> = {};
    for (const s of sessions) {
      if (!processedOfferIds.has(s.offerId)) {
        if (!orphanSessionsByOfferId[s.offerId]) {
          orphanSessionsByOfferId[s.offerId] = [];
        }
        orphanSessionsByOfferId[s.offerId].push(s);
      }
    }

    for (const [offerId, sList] of Object.entries(orphanSessionsByOfferId)) {
      const first = sList[0];
      const isTeacher = first.teacherId === currentUser.id;
      const partnerId = isTeacher ? first.learnerId : first.teacherId;
      const partnerName = isTeacher ? first.learnerName : first.teacherName;

      let unifiedStatus: UnifiedSwap['status'] = 'SCHEDULED';
      if (sList.some(s => s.status === 'DISPUTED')) {
        unifiedStatus = 'DISPUTED';
      } else if (sList.every(s => s.status === 'SETTLED')) {
        unifiedStatus = 'COMPLETED';
      }

      const totalTokens = sList.reduce((sum, s) => sum + s.chargedTokens, 0);

      list.push({
        id: offerId,
        partnerId,
        partnerName: partnerName || 'Swap Peer',
        partnerRole: 'PEER',
        isIncomingProposal: false,
        type: sList.length > 1 ? 'SWAP' : 'DIRECT',
        status: unifiedStatus,
        myRole: sList.length > 1 ? 'MUTUAL' : isTeacher ? 'TEACHER' : 'LEARNER',
        mySkillName: isTeacher ? first.skillName : (sList[1]?.skillName || 'Skill'),
        partnerSkillName: !isTeacher ? first.skillName : (sList[1]?.skillName || 'Skill'),
        escrowTokens: totalTokens,
        sessions: sList,
        createdAt: new Date().toISOString(),
      });
    }

    return list;
  }, [offers, sessions, currentUser.id]);

  // Handle active swap selection
  const selectedSwapId = controlledSelectedSwapId !== undefined ? controlledSelectedSwapId : internalSelectedSwapId;
  const setSelectedSwap = (id: string | null) => {
    if (onSelectSwapId) {
      onSelectSwapId(id);
    } else {
      setInternalSelectedSwapId(id);
    }
  };

  // Active swap resolution
  const activeSwap: UnifiedSwap | null = useMemo(() => {
    if (unifiedSwaps.length === 0) return null;
    if (selectedSwapId) {
      const found = unifiedSwaps.find(s => s.id === selectedSwapId);
      if (found) return found;
    }
    return unifiedSwaps[0];
  }, [unifiedSwaps, selectedSwapId]);

  // Filtered list
  const filteredSwaps = useMemo(() => {
    return unifiedSwaps.filter(swap => {
      // Status filter
      if (statusFilter === 'ACTIVE') {
        if (swap.status !== 'ACCEPTED' && swap.status !== 'SCHEDULED') return false;
      } else if (statusFilter === 'PENDING') {
        if (swap.status !== 'PENDING') return false;
      } else if (statusFilter === 'COMPLETED') {
        if (swap.status !== 'COMPLETED') return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = swap.partnerName.toLowerCase().includes(q);
        const matchesSkill1 = swap.mySkillName.toLowerCase().includes(q);
        const matchesSkill2 = swap.partnerSkillName.toLowerCase().includes(q);
        return matchesName || matchesSkill1 || matchesSkill2;
      }
      return true;
    });
  }, [unifiedSwaps, statusFilter, searchQuery]);

  // Chat filter for active swap
  const activeMessages = useMemo(() => {
    if (!activeSwap) return [];
    return chatMessages.filter(
      m => m.threadId === activeSwap.id || m.threadId === `off-${activeSwap.id}` || !m.threadId
    );
  }, [chatMessages, activeSwap]);

  // Off-platform safety detector
  const checkForOffPlatformLeaks = (text: string): string | null => {
    const phoneRegex = /(?:\+91|0)?[6-9]\d{9}/g;
    const emailRegex = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
    const paymentRegex = /\b(gpay|phonepe|paytm|upi|google pay|bank transfer|cash)\b/i;

    if (phoneRegex.test(text)) {
      return 'Notice: Phone number detected. Keep scheduling inside SkillSwap to protect your escrow guarantee.';
    }
    if (emailRegex.test(text)) {
      return 'Notice: Email detected. Peer coordination and meeting links are safeguarded inside this thread.';
    }
    if (paymentRegex.test(text)) {
      return 'Notice: Direct external payment mentioned. External cash or UPI voids SkillSwap escrow protection.';
    }
    return null;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputText(text);
    const warning = checkForOffPlatformLeaks(text);
    setOffPlatformWarning(warning);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeSwap) return;

    onSendMessage(inputText, 'TEXT', undefined, activeSwap.id);
    setInputText('');
    setOffPlatformWarning(null);
  };

  const handleProposeTimeSubmit = async () => {
    if (!activeSwap) return;
    setIsProposing(true);

    let meetLink = 'https://meet.google.com/new'; // fallback
    try {
      const now = new Date();
      const [startHour] = (proposedTime.match(/(\d{1,2}):(\d{2})/) || ['', '18', '00']).slice(1);
      const startDate = new Date(now);
      startDate.setHours(parseInt(startHour || '18', 10), 0, 0, 0);
      if (startDate <= now) {
        startDate.setDate(startDate.getDate() + 1);
      }
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

      const skillName = proposedLegIndex === 1 ? activeSwap.partnerSkillName : activeSwap.mySkillName;

      const calendarPayload = {
        summary: `SkillSwap Session: ${skillName} (Leg ${proposedLegIndex})`,
        description: `Peer skill exchange between ${currentUser.fullName} and ${activeSwap.partnerName} via SkillSwap platform.`,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        attendees: [currentUser.email],
        timeZone: currentUser.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        accessToken: '',
      };

      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.provider_token) {
          calendarPayload.accessToken = session.provider_token;
        }
      } catch {
        // ignore
      }

      if (calendarPayload.accessToken) {
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(calendarPayload),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.meetLink) meetLink = data.meetLink;
        }
      }
    } catch (err) {
      console.warn('Calendar proposal fallback to Meet link:', err);
    }

    onSendMessage(
      `Proposed time for Leg ${proposedLegIndex}: ${proposedDate} (${proposedTime})`,
      'PROPOSE_TIME',
      {
        proposedDate,
        proposedTime,
        legIndex: proposedLegIndex,
        meetLink,
        skillName: proposedLegIndex === 1 ? activeSwap.partnerSkillName : activeSwap.mySkillName,
      },
      activeSwap.id
    );

    setShowProposeModal(false);
    setIsProposing(false);
  };

  const getStatusBadge = (status: UnifiedSwap['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="h-3 w-3" />
            Proposal Pending
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            <Calendar className="h-3 w-3" />
            Session Scheduled
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="h-3 w-3" />
            Escrow Active
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3" />
            Settled & Completed
          </span>
        );
      case 'DISPUTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <AlertTriangle className="h-3 w-3" />
            Under Dispute Review
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-ink/5 text-ink/60 border border-ink/10">
            {status}
          </span>
        );
    }
  };

  // 1. EMPTY STATE (No Swaps Yet)
  if (unifiedSwaps.length === 0) {
    return (
      <div className="space-y-6">
        {/* Main Empty Card */}
        <div className="glass-panel rounded-3xl p-8 sm:p-12 text-center border border-ink/10 relative overflow-hidden shadow-xl">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/80 to-transparent pointer-events-none" />

          {/* Central Icon */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)] shadow-sm mb-5">
            <ArrowRightLeft className="h-8 w-8" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-ink tracking-tight">
            No Active Swaps Yet
          </h2>

          <p className="mt-3 max-w-xl mx-auto text-sm text-ink/70 leading-relaxed">
            SkillSwap enables direct peer-to-peer skill exchanges backed by automated escrow protection.
            When you propose a skill exchange in Discover or receive a proposal from a peer, your active
            negotiations, schedule coordination, and video links will live here.
          </p>

          {/* Discover CTA */}
          <div className="mt-8 flex justify-center">
            <button
              onClick={onNavigateToDiscover}
              className="flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-all shadow-md cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>Explore Discover to Start a Swap</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Feature Highlights Grid */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 text-left border-t border-ink/8 pt-8 max-w-4xl mx-auto">
            <div className="p-4 rounded-2xl bg-mist-pure/60 border border-ink/5">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Dual Escrow Guarantee</span>
              </div>
              <p className="text-xs text-ink/60 mt-1.5 leading-relaxed">
                Tokens stay safely held in escrow and are only released after mutual session completion sign-off.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-mist-pure/60 border border-ink/5">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <TrendingDown className="h-4 w-4 text-[var(--color-accent)]" />
                <span>70% In-Kind Swap Savings</span>
              </div>
              <p className="text-xs text-ink/60 mt-1.5 leading-relaxed">
                Exchanging skills simultaneously slashes token costs by up to 70% compared to direct list prices.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-mist-pure/60 border border-ink/5">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <CalendarDays className="h-4 w-4 text-lagoon" />
                <span>Integrated Google Meet</span>
              </div>
              <p className="text-xs text-ink/60 mt-1.5 leading-relaxed">
                Agree on a time slot and generate verified calendar events and Meet links instantly.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. PRODUCTION MASTER-DETAIL WORKSPACE (User has Swaps)
  return (
    <div className="space-y-6">
      {/* Top Banner Overview */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 glass-panel rounded-2xl p-5 border border-ink/8">
        <div>
          <h2 className="text-xl font-display font-extrabold text-ink flex items-center gap-2.5">
            <ArrowRightLeft className="h-5 w-5 text-[var(--color-accent)]" />
            <span>My Skill Swaps</span>
          </h2>
          <p className="text-xs text-ink/60 mt-0.5">
            Coordinate meeting schedules, review proposals, and manage escrow sessions in one secure hub.
          </p>
        </div>

        <button
          onClick={onNavigateToDiscover}
          className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full border border-ink/15 text-ink hover:bg-ink/5 transition-all cursor-pointer"
        >
          <Search className="h-3.5 w-3.5 text-ink/60" />
          <span>Find New Peer Matches</span>
        </button>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Swaps Directory List (4 cols) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="glass-panel rounded-2xl p-4 border border-ink/8 space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by peer or skill..."
                className="w-full rounded-xl border border-ink/15 bg-mist-pure pl-9 pr-4 py-2 text-xs text-ink placeholder:text-ink-muted/50 focus:border-lagoon focus:outline-none dark:bg-mist-subtle dark:border-white/10"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-medium">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-ink text-white dark:bg-saffron dark:text-black font-semibold'
                    : 'text-ink/60 hover:bg-ink/5'
                }`}
              >
                All ({unifiedSwaps.length})
              </button>
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'ACTIVE'
                    ? 'bg-ink text-white dark:bg-saffron dark:text-black font-semibold'
                    : 'text-ink/60 hover:bg-ink/5'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter('PENDING')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'PENDING'
                    ? 'bg-ink text-white dark:bg-saffron dark:text-black font-semibold'
                    : 'text-ink/60 hover:bg-ink/5'
                }`}
              >
                Proposals
              </button>
              <button
                onClick={() => setStatusFilter('COMPLETED')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-ink text-white dark:bg-saffron dark:text-black font-semibold'
                    : 'text-ink/60 hover:bg-ink/5'
                }`}
              >
                Completed
              </button>
            </div>
          </div>

          {/* Swaps Cards Scrollable List */}
          <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
            {filteredSwaps.length === 0 ? (
              <div className="p-8 text-center text-xs text-ink/50 glass-panel rounded-2xl border border-ink/5">
                No swaps match your filter criteria.
              </div>
            ) : (
              filteredSwaps.map(swap => {
                const isSelected = activeSwap?.id === swap.id;
                return (
                  <div
                    key={swap.id}
                    onClick={() => setSelectedSwap(swap.id)}
                    className={`rounded-2xl p-4 transition-all cursor-pointer border text-left ${
                      isSelected
                        ? 'glass-panel-elevated border-saffron/50 shadow-md ring-1 ring-saffron/30'
                        : 'glass-panel border-ink/8 hover:border-ink/20 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-ink/10 dark:bg-white/10 flex items-center justify-center text-ink font-bold font-display text-sm shrink-0 border border-ink/5">
                          {swap.partnerName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-display font-bold text-sm text-ink line-clamp-1">
                            {swap.partnerName}
                          </h4>
                          <span className="text-[10px] font-mono text-ink/50 uppercase">
                            {swap.type === 'SWAP' ? '2-Way Skill Swap' : 'Direct Mentorship'}
                          </span>
                        </div>
                      </div>

                      {/* Escrow Tokens badge */}
                      <span className="text-xs font-mono font-bold text-ink shrink-0 bg-ink/5 dark:bg-white/5 px-2 py-0.5 rounded-md">
                        {swap.escrowTokens} SP
                      </span>
                    </div>

                    {/* Exchanged Skills */}
                    <div className="mt-3 text-xs bg-mist-pure/60 dark:bg-mist-subtle/40 rounded-xl p-2.5 border border-ink/5 space-y-1">
                      <div className="flex items-center justify-between text-ink/75">
                        <span className="text-[10px] uppercase font-mono text-ink/50">Exchange</span>
                        {getStatusBadge(swap.status)}
                      </div>
                      <div className="font-semibold text-ink text-[11px] line-clamp-1 flex items-center gap-1.5">
                        <span className="text-emerald-700 dark:text-emerald-400">Teach: {swap.mySkillName}</span>
                        <ArrowRightLeft className="h-3 w-3 text-ink/40 shrink-0" />
                        <span className="text-lagoon dark:text-teal-300">Learn: {swap.partnerSkillName}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Swap Workspace (8 cols) */}
        {activeSwap && (
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            {/* Workspace Card */}
            <div className="glass-panel rounded-3xl border border-ink/10 overflow-hidden shadow-xl">
              {/* Header Bar */}
              <div className="border-b border-ink/8 bg-mist-pure/80 backdrop-blur-md p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-2xl bg-ink/10 dark:bg-white/10 flex items-center justify-center text-ink font-bold font-display text-base border border-ink/10">
                      {activeSwap.partnerName.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-extrabold text-ink text-base">
                        {activeSwap.partnerName}
                      </h3>
                      {getStatusBadge(activeSwap.status)}
                    </div>
                    <p className="text-xs text-ink/60 mt-0.5">
                      Escrow Swap Thread â€¢ {activeSwap.type === 'SWAP' ? 'Dual-Leg Skill Exchange' : 'Direct Learning Session'}
                    </p>
                  </div>
                </div>

                {/* Top Action Buttons */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  {activeSwap.isIncomingProposal && onAcceptOffer && (
                    <button
                      onClick={() => onAcceptOffer(activeSwap.id)}
                      className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-all shadow-xs cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Accept Proposal</span>
                    </button>
                  )}
                  {activeSwap.isIncomingProposal && onDeclineOffer && (
                    <button
                      onClick={() => onDeclineOffer(activeSwap.id)}
                      className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3.5 py-2 text-xs font-semibold text-ink hover:bg-ink/5 transition-all cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Decline</span>
                    </button>
                  )}

                  <button
                    onClick={() => setShowProposeModal(true)}
                    className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-lagoon transition-all shadow-xs cursor-pointer dark:bg-saffron dark:text-black dark:hover:bg-saffron-light"
                  >
                    <Calendar className="h-3.5 w-3.5 text-saffron dark:text-black" />
                    <span>Propose Meet Time</span>
                  </button>
                </div>
              </div>

              {/* Swap Overview / Progress Banner */}
              <div className="bg-mist/80 p-5 border-b border-ink/6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Leg 1 Summary */}
                  <div className="rounded-xl p-3 bg-mist-pure/70 border border-ink/6">
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase text-ink/50">
                      <span>Leg 1: {activeSwap.partnerSkillName}</span>
                      <span className="font-bold text-lagoon">You Learn</span>
                    </div>
                    <div className="mt-1 font-semibold text-xs text-ink">
                      Taught by {activeSwap.partnerName}
                    </div>
                  </div>

                  {/* Leg 2 Summary */}
                  {activeSwap.type === 'SWAP' ? (
                    <div className="rounded-xl p-3 bg-mist-pure/70 border border-ink/6">
                      <div className="flex items-center justify-between text-[10px] font-mono uppercase text-ink/50">
                        <span>Leg 2: {activeSwap.mySkillName}</span>
                        <span className="font-bold text-emerald-600">You Teach</span>
                      </div>
                      <div className="mt-1 font-semibold text-xs text-ink">
                        Taught to {activeSwap.partnerName}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl p-3 bg-mist-pure/70 border border-ink/6">
                      <div className="flex items-center justify-between text-[10px] font-mono uppercase text-ink/50">
                        <span>Direct Escrow</span>
                        <span className="font-bold text-emerald-600">Token Hold</span>
                      </div>
                      <div className="mt-1 font-semibold text-xs text-ink">
                        {activeSwap.escrowTokens} Skill Points Held
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat Stream Messages */}
              <div className="h-96 overflow-y-auto p-6 space-y-4 bg-mist-subtle/20">
                <div className="rounded-2xl bg-mist border border-ink/6 p-3 text-center text-xs text-ink/60 font-mono">
                  ðŸ”’ Ephemeral escrow thread for {activeSwap.partnerName} â€¢ Meet links generate automatically upon acceptance
                </div>

                {activeMessages.map(msg => {
                  const isMe = msg.senderId === currentUser.id;

                  if (msg.type === 'PROPOSE_TIME') {
                    return (
                      <div key={msg.id} className="mx-auto my-3 max-w-md w-full">
                        <div className="rounded-2xl glass-panel-elevated p-5 border border-saffron/30 shadow-md">
                          <div className="flex items-center justify-between pb-3 border-b border-ink/8">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-saffron flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Time Slot Proposal
                            </span>
                            <span className="text-[10px] font-mono text-ink/40">
                              Leg {msg.metadata?.legIndex || 1}
                            </span>
                          </div>

                          <div className="mt-3">
                            <div className="text-sm font-bold text-ink flex items-center gap-2">
                              <Clock className="h-4 w-4 text-lagoon" />
                              <span>{String(msg.metadata?.proposedDate || '')} â€¢ {String(msg.metadata?.proposedTime || '')}</span>
                            </div>
                            <p className="text-xs text-ink/60 mt-1">
                              Proposed by {isMe ? 'you' : activeSwap.partnerName}. Confirming generates an active Google Meet link.
                            </p>
                          </div>

                          <div className="mt-4 pt-3 border-t border-ink/8 flex items-center justify-between">
                            {msg.metadata?.accepted ? (
                              <div className="flex items-center justify-between w-full">
                                <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-700 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                                  <Check className="h-3.5 w-3.5" />
                                  Accepted & Scheduled
                                </span>
                                {msg.metadata?.meetLink && (
                                  <a
                                    href={String(msg.metadata.meetLink)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white hover:bg-lagoon transition-all shadow-xs dark:bg-saffron dark:text-black"
                                  >
                                    <Video className="h-3 w-3 text-emerald-400" />
                                    <span>Join Meet</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-end w-full gap-2">
                                {!isMe ? (
                                  <button
                                    onClick={() =>
                                      onAcceptProposedTime(
                                        msg.id,
                                        String(msg.metadata?.meetLink || 'https://meet.google.com/new')
                                      )
                                    }
                                    className="flex items-center gap-1.5 rounded-full bg-lagoon px-5 py-2 text-xs font-semibold text-white hover:bg-lagoon-dark transition-all shadow-xs cursor-pointer"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    <span>Accept & Generate Meet</span>
                                  </button>
                                ) : (
                                  <span className="text-xs text-ink/50 font-mono">
                                    Awaiting {activeSwap.partnerName}&apos;s acceptance
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-md rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                          isMe
                            ? 'bg-ink text-white dark:bg-saffron dark:text-black rounded-br-none'
                            : 'glass-panel text-ink border border-ink/8 rounded-bl-none'
                        }`}
                      >
                        {msg.content}
                      </div>
                      <span className="mt-1 text-[10px] text-ink/40 font-mono px-1">
                        {msg.timestamp}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Safety Warning Pill */}
              {offPlatformWarning && (
                <div className="bg-amber-500/10 border-t border-amber-500/20 px-6 py-2 flex items-center justify-between text-xs text-amber-900 dark:text-amber-300">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span>{offPlatformWarning}</span>
                  </div>
                  <button
                    onClick={() => setOffPlatformWarning(null)}
                    className="text-amber-800 dark:text-amber-300 hover:text-black dark:hover:text-white cursor-pointer font-bold"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Chat Input Bar */}
              <form onSubmit={handleSend} className="border-t border-ink/8 bg-mist-pure/90 p-4">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={handleInputChange}
                    placeholder={`Message ${activeSwap.partnerName} to coordinate sessions...`}
                    className="flex-1 rounded-full border border-ink/15 bg-mist-pure px-5 py-3 text-xs text-ink placeholder:text-ink-muted/50 focus:border-lagoon focus:outline-none shadow-xs transition-all dark:bg-mist-subtle dark:border-white/15"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-all cursor-pointer ${
                      inputText.trim()
                        ? 'bg-lagoon text-white hover:bg-lagoon-dark shadow-md shadow-lagoon/20'
                        : 'bg-ink/10 text-ink/30 cursor-not-allowed'
                    }`}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Propose Time Modal */}
      {showProposeModal && activeSwap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md glass-panel-elevated rounded-3xl p-7 shadow-2xl border border-white/40 space-y-4">
            <div className="flex items-center justify-between border-b border-ink/8 pb-3">
              <h3 className="font-display font-bold text-ink text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-lagoon" />
                <span>Propose Meet Time with {activeSwap.partnerName}</span>
              </h3>
              <button
                onClick={() => setShowProposeModal(false)}
                className="rounded-full p-1.5 text-ink/40 hover:bg-ink/5 hover:text-ink cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Exchange Leg</label>
                <select
                  value={proposedLegIndex}
                  onChange={e => setProposedLegIndex(parseInt(e.target.value, 10))}
                  className="w-full rounded-xl border border-ink/15 bg-mist-pure p-2.5 text-xs text-ink focus:border-lagoon focus:outline-none dark:bg-mist-subtle dark:border-white/15 dark:text-ink"
                >
                  <option value={1}>Leg 1: {activeSwap.partnerSkillName} (You Learn)</option>
                  {activeSwap.type === 'SWAP' && (
                    <option value={2}>Leg 2: {activeSwap.mySkillName} (You Teach)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Proposed Date</label>
                <input
                  type="text"
                  value={proposedDate}
                  onChange={e => setProposedDate(e.target.value)}
                  placeholder="e.g. Tomorrow or Monday, 12 Oct"
                  className="w-full rounded-xl border border-ink/15 bg-mist-pure p-2.5 text-xs text-ink placeholder:text-ink-muted/50 focus:border-lagoon focus:outline-none dark:bg-mist-subtle dark:border-white/15"
                />
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Proposed Time (IST)</label>
                <input
                  type="text"
                  value={proposedTime}
                  onChange={e => setProposedTime(e.target.value)}
                  placeholder="e.g. 18:00 - 19:00 IST"
                  className="w-full rounded-xl border border-ink/15 bg-mist-pure p-2.5 text-xs text-ink placeholder:text-ink-muted/50 focus:border-lagoon focus:outline-none dark:bg-mist-subtle dark:border-white/15"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-ink/8">
              <button
                type="button"
                onClick={() => setShowProposeModal(false)}
                className="rounded-full px-4 py-2 text-xs font-semibold text-ink/70 hover:bg-ink/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProposeTimeSubmit}
                disabled={isProposing}
                className={`rounded-full px-5 py-2 text-xs font-semibold text-white shadow-xs cursor-pointer ${
                  isProposing ? 'bg-lagoon/60 cursor-wait' : 'bg-lagoon hover:bg-lagoon-dark'
                }`}
              >
                {isProposing ? 'Generating Meet Link...' : 'Send Time Proposal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



