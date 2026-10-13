'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ArrowRightLeft, 
  ShieldCheck, 
  Zap, 
  Lock, 
  AlertCircle 
} from 'lucide-react';
import { Profile, PeerMatch, UserTeachSkill, OfferType, Wallet } from '@/types';
import { normalizeSkillName } from '@/lib/skills';
import { generateQuoteBreakdown } from '@/lib/pricing';

interface SwapProposalModalProps {
  match: PeerMatch;
  currentUser: Profile;
  wallet: Wallet;
  isOpen: boolean;
  onClose: () => void;
  onSubmitOffer: (offerData: {
    type: OfferType;
    match: PeerMatch;
    proposerTeachSkill?: UserTeachSkill;
    durationMinutes: number;
    message: string;
    chargedTokens: number;
  }) => void;
  onOpenWallet: () => void;
}

export const SwapProposalModal: React.FC<SwapProposalModalProps> = ({
  match,
  currentUser,
  wallet,
  isOpen,
  onClose,
  onSubmitOffer,
  onOpenWallet,
}) => {
  const hasTeachSkills = Boolean(currentUser.teachSkills && currentUser.teachSkills.length > 0);

  // Auto-detect matching teach skill if teacher desires one
  const matchedInitialSkill = useMemo(() => {
    if (!hasTeachSkills) return undefined;
    if (match.teacherDesiresSkill) {
      const found = currentUser.teachSkills.find(
        s => s.skillId === match.teacherDesiresSkill?.skillId ||
             normalizeSkillName(s.skillName) === normalizeSkillName(match.teacherDesiresSkill?.skillName || '')
      );
      if (found) return found;
    }
    return currentUser.teachSkills[0];
  }, [currentUser.teachSkills, match.teacherDesiresSkill, hasTeachSkills]);

  const [offerType, setOfferType] = useState<OfferType>(
    match.isSwapMatch && hasTeachSkills ? 'SWAP' : 'DIRECT'
  );
  const [duration, setDuration] = useState<number>(60);
  const [selectedTeachSkill, setSelectedTeachSkill] = useState<UserTeachSkill | undefined>(matchedInitialSkill);
  const [message, setMessage] = useState<string>('');
  const [quoteTimer, setQuoteTimer] = useState<number>(600); // 10 minutes

  useEffect(() => {
    if (!isOpen) return;
    queueMicrotask(() => {
      setQuoteTimer(600);
      if (hasTeachSkills && matchedInitialSkill) {
        setSelectedTeachSkill(matchedInitialSkill);
        if (match.isSwapMatch) {
          setOfferType('SWAP');
        }
      } else {
        setOfferType('DIRECT');
        setSelectedTeachSkill(undefined);
      }
    });
    const interval = setInterval(() => {
      setQuoteTimer(prev => (prev > 0 ? prev - 1 : 600));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, hasTeachSkills, matchedInitialSkill, match.isSwapMatch]);

  if (!isOpen) return null;

  const availableTokens = Math.floor(wallet.availablePaise / 100);

  const quote = generateQuoteBreakdown({
    type: offerType,
    proposerLeg: {
      skillId: match.teacherOfferingSkill.skillId,
      skillName: match.teacherOfferingSkill.skillName,
      teacherId: match.teacher.id,
      learnerId: currentUser.id,
      hourlyRate: match.teacherOfferingSkill.hourlyRate,
      durationMinutes: duration,
    },
    recipientLeg:
      offerType === 'SWAP' && selectedTeachSkill
        ? {
            skillId: selectedTeachSkill.skillId,
            skillName: selectedTeachSkill.skillName,
            teacherId: currentUser.id,
            learnerId: match.teacher.id,
            hourlyRate: selectedTeachSkill.hourlyRate,
            durationMinutes: duration,
          }
        : undefined,
  });

  const tokensNeeded = quote.proposerLeg.chargedTokens;
  const isSufficientFunds = availableTokens >= tokensNeeded;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleSend = () => {
    if (!isSufficientFunds) {
      onOpenWallet();
      return;
    }

    if (offerType === 'SWAP' && !selectedTeachSkill) {
      return;
    }

    onSubmitOffer({
      type: offerType,
      match,
      proposerTeachSkill: offerType === 'SWAP' ? selectedTeachSkill : undefined,
      durationMinutes: duration,
      message,
      chargedTokens: tokensNeeded,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-xl p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl glass-panel-elevated rounded-3xl p-7 sm:p-9 shadow-2xl border border-white/40 overflow-hidden">
        {/* Specular Top Hairline */}
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/80 to-transparent" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-ink/8 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lagoon text-white shadow-md shadow-lagoon/20">
              {offerType === 'SWAP' ? <ArrowRightLeft className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold font-display text-ink flex items-center gap-2">
                {offerType === 'SWAP' ? 'Configure Mutual Skill Swap' : 'Direct Learning Request'}
                {match.isSwapMatch && offerType === 'SWAP' && (
                  <span className="rounded-full bg-saffron/20 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-900 dark:text-saffron dark:bg-saffron/15 dark:border-saffron/30 border border-saffron/30">
                    70% IN-KIND DISCOUNT
                  </span>
                )}
              </h2>
              <p className="text-xs text-ink/60">
                Partner: <strong className="text-ink font-medium">{match.teacher.fullName}</strong> ({match.teacher.city}, {match.teacher.country})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-ink/40 hover:bg-ink/5 hover:text-ink transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Selector Cards */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={!hasTeachSkills}
            onClick={() => hasTeachSkills && setOfferType('SWAP')}
            className={`flex flex-col items-start rounded-2xl p-4 border transition-all text-left ${
              !hasTeachSkills
                ? 'opacity-50 cursor-not-allowed border-ink/10 bg-mist-pure/30'
                : offerType === 'SWAP'
                ? 'border-lagoon bg-lagoon/6 shadow-xs cursor-pointer'
                : 'border-ink/10 bg-mist-pure/60 text-ink/60 hover:border-ink/20 cursor-pointer'
            }`}
          >
            <div className="flex w-full items-center justify-between mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-lagoon flex items-center gap-1.5">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Mutual Swap
              </span>
              <span className="text-[10px] rounded-full bg-emerald-500/15 text-emerald-800 px-2 py-0.2 font-mono font-bold">
                {hasTeachSkills ? 'RECOMMENDED' : 'SKILLS NEEDED'}
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-ink mt-0.5">
              {hasTeachSkills ? (match.swapPriceTokens ?? quote.proposerLeg.chargedTokens) : '—'} SP
            </div>
            <p className="text-[11px] text-ink/65 mt-1 leading-snug">
              {hasTeachSkills
                ? `You teach ${selectedTeachSkill?.skillName || 'a skill'}, they teach you ${match.teacherOfferingSkill.skillName}. Up to 70% in-kind savings.`
                : 'Add teaching skills to your profile to unlock 70% mutual swap discounts.'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setOfferType('DIRECT')}
            className={`flex flex-col items-start rounded-2xl p-4 border transition-all text-left cursor-pointer ${
              offerType === 'DIRECT'
                ? 'border-lagoon bg-lagoon/6 shadow-xs'
                : 'border-ink/10 bg-mist-pure/60 text-ink/60 hover:border-ink/20'
            }`}
          >
            <div className="flex w-full items-center justify-between mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink/70 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-saffron" />
                Direct Learn
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-ink mt-0.5">
              {quote.proposerLeg.listPriceTokens} SP
            </div>
            <p className="text-[11px] text-ink/65 mt-1 leading-snug">
              Standard 1:1 session. Pay the teacher&apos;s listed rate of {match.teacherOfferingSkill.hourlyRate} SP/hr.
            </p>
          </button>
        </div>

        {/* Swap Leg Configuration */}
        {offerType === 'SWAP' && hasTeachSkills && (
          <div className="mt-4 rounded-2xl border border-ink/8 bg-mist p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-ink/60 font-mono">
                Two-Leg Session Breakdown
              </span>
              <span className="text-[11px] font-mono text-lagoon font-semibold">
                Formula: PRD §7.6A
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-ink/8 bg-mist-pure/95 shadow-xs">
                <span className="text-[10px] font-mono uppercase text-lagoon font-bold">Leg 1: You Learn</span>
                <div className="font-semibold text-ink mt-1 text-sm">{match.teacherOfferingSkill.skillName}</div>
                <div className="text-ink/60 text-[11px] mt-0.5">Taught by {match.teacher.fullName}</div>
                <div className="mt-2 text-ink/60 flex items-center justify-between font-mono">
                  <span>List: {quote.proposerLeg.listPriceTokens} SP</span>
                  <span className="text-emerald-700 font-bold">Swap: {quote.proposerLeg.chargedTokens} SP</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-ink/8 bg-mist-pure/95 shadow-xs">
                <span className="text-[10px] font-mono uppercase text-amber-700 dark:text-saffron font-bold">Leg 2: You Teach</span>
                <select
                  value={selectedTeachSkill?.skillId || ''}
                  onChange={e => {
                    const found = currentUser.teachSkills.find(s => s.skillId === e.target.value);
                    if (found) setSelectedTeachSkill(found);
                  }}
                  className="mt-1 w-full rounded-lg bg-mist border border-ink/15 px-2 py-1 text-xs text-ink focus:outline-none focus:border-lagoon dark:bg-mist-subtle dark:border-white/15 dark:text-ink"
                >
                  {currentUser.teachSkills.map(skill => (
                    <option key={skill.skillId} value={skill.skillId}>
                      {skill.skillName} ({skill.hourlyRate} SP/hr)
                    </option>
                  ))}
                </select>
                <div className="text-ink/60 text-[11px] mt-1">Taught to {match.teacher.fullName}</div>
                <div className="mt-2 text-ink/60 flex items-center justify-between font-mono">
                  <span>List: {quote.recipientLeg?.listPriceTokens} SP</span>
                  <span className="text-emerald-700 font-bold">Swap: {quote.recipientLeg?.chargedTokens} SP</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Duration Picker */}
        <div className="mt-4">
          <label className="text-xs font-semibold text-ink block mb-2">Duration per leg</label>
          <div className="flex gap-2">
            {[30, 45, 60, 90].map(dur => (
              <button
                key={dur}
                type="button"
                onClick={() => setDuration(dur)}
                className={`flex-1 rounded-xl py-2 text-xs font-mono font-bold transition-all border cursor-pointer ${
                  duration === dur
                    ? 'border-ink bg-ink text-white shadow-xs dark:border-saffron dark:bg-saffron dark:text-black'
                    : 'border-ink/10 bg-mist-pure text-ink/70 hover:border-ink/20'
                }`}
              >
                {dur} mins
              </button>
            ))}
          </div>
        </div>

        {/* Introduction note */}
        <div className="mt-4">
          <label className="text-xs font-semibold text-ink block mb-1.5">
            Introduction Message (Optional)
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Introduce your goals, what you are hoping to practice, and your general availability..."
            rows={2}
            className="w-full rounded-2xl border border-ink/15 bg-mist-pure p-3 text-xs text-ink focus:border-lagoon focus:outline-none shadow-xs transition-all placeholder:text-ink-muted/60 resize-none dark:bg-mist-subtle dark:border-white/15 dark:placeholder:text-ink-muted/40"
          />
        </div>

        {/* Escrow Financial Invariant Summary */}
        <div className="mt-4 rounded-2xl bg-mist-pure/80 border border-ink/8 p-4">
          <div className="flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <div className="text-ink/60 flex items-center gap-1.5 font-medium">
                <Lock className="h-3.5 w-3.5 text-lagoon" />
                <span>Skill Points Held in Escrow:</span>
                <strong className="text-ink font-mono font-bold text-sm">{tokensNeeded} SP</strong>
                <span className="text-[10px] text-ink/50 font-mono">(SP{tokensNeeded}.00)</span>
              </div>
              <div className="text-[11px] text-ink/55">
                Wallet Balance: <strong className="text-ink font-mono">{availableTokens} SP</strong>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-mono text-ink/40 block">Quote locked for:</span>
              <span className="font-mono text-xs font-bold text-lagoon">{formatTimer(quoteTimer)}</span>
            </div>
          </div>

          {!isSufficientFunds && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-900 dark:text-amber-300">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
                <span>Insufficient skill points. You need {tokensNeeded - availableTokens} more skill points.</span>
              </div>
              <button
                type="button"
                onClick={onOpenWallet}
                className="font-bold underline text-amber-900 hover:text-black cursor-pointer ml-2 text-xs dark:text-amber-300 dark:hover:text-white"
              >
                Top up now
              </button>
            </div>
          )}
        </div>

        {/* Primary Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-2.5 text-xs font-semibold text-ink/70 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={!isSufficientFunds}
            className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-xs font-semibold text-white shadow-md transition-all cursor-pointer ${
              isSufficientFunds
                ? 'bg-lagoon hover:bg-lagoon-dark shadow-lagoon/20 hover:shadow-lg'
                : 'bg-ink/40 cursor-not-allowed'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Lock Escrow & Send Proposal</span>
          </button>
        </div>
      </div>
    </div>
  );
};
