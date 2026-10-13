'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { 
  ArrowRightLeft, 
  Search, 
  Calendar,
  Zap
} from 'lucide-react';
import { PeerMatch, Profile, SessionLeg } from '@/types';

interface MatchesViewProps {
  matches: PeerMatch[];
  onSelectMatch: (match: PeerMatch, initialMode?: 'SWAP' | 'DIRECT') => void;
  onOpenEditSkills: () => void;
  currentUser: Profile;
  sessions: SessionLeg[];
}

export const MatchesView: React.FC<MatchesViewProps> = ({
  matches,
  onSelectMatch,
  onOpenEditSkills,
  currentUser,
  sessions
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'best' | 'rating' | 'rate-asc' | 'sessions'>('best');

  const categories = ['all', 'Design', 'Coding', 'Music', 'Photography', 'Languages'];
  
  const filteredMatches = useMemo(() => {
    return matches
      .filter(m => {
        if (selectedCategory !== 'all' && m.teacherOfferingSkill.category !== selectedCategory && 
            !m.teacherOfferingSkill.skillName.toLowerCase().includes(selectedCategory.toLowerCase())) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const inName = m.teacher.fullName.toLowerCase().includes(q);
          const inSkill = m.teacherOfferingSkill.skillName.toLowerCase().includes(q);
          const inSeek = m.teacher.learnSkills.some(s => s.skillName.toLowerCase().includes(q));
          const inBio = m.teacher.bio.toLowerCase().includes(q);
          if (!inName && !inSkill && !inSeek && !inBio) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'rating') return b.teacher.reputationScore - a.teacher.reputationScore;
        if (sortBy === 'rate-asc') return a.teacherOfferingSkill.hourlyRate - b.teacherOfferingSkill.hourlyRate;
        if (sortBy === 'sessions') return b.teacher.completedSessionsCount - a.teacher.completedSessionsCount;
        return b.matchScore - a.matchScore;
      });
  }, [matches, selectedCategory, searchQuery, sortBy]);

  const upcomingSessions = useMemo(() => {
    return sessions
      .filter(s => ['PENDING_CONFIRMATION', 'SCHEDULED'].includes(s.status))
      .sort((a, b) => new Date(a.scheduledStart || '').getTime() - new Date(b.scheduledStart || '').getTime())
      .slice(0, 5);
  }, [sessions]);

  return (
    <div className="flex flex-col xl:flex-row gap-8 pb-12">
      {/* Main Left Column */}
      <div className="flex-1 space-y-8 min-w-0">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-accent)]">Stay curious. Grow together.</p>
            <h1 className="text-3xl sm:text-4xl font-display font-semibold mt-2 tracking-tight text-[var(--color-text)]">
              Your next skill starts here<span className="text-[var(--color-accent)]">.</span>
            </h1>
            <p className="text-[var(--color-text-muted)] mt-1.5 text-sm sm:text-base">
              Share what you know. Find someone who inspires you.
            </p>
          </div>
          <button 
            onClick={onOpenEditSkills} 
            className="px-5 py-2.5 rounded-[12px] border border-[var(--color-border)] text-sm font-medium hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer shrink-0"
          >
            + My skills
          </button>
        </div>
        
        {/* Hero Banner */}
        <div className="relative rounded-2xl overflow-hidden min-h-[240px] flex flex-col justify-center p-6 sm:p-10 border border-[var(--color-border)]">
          {/* Background image & gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/30 z-10" />
          <Image 
            src="/hero-banner.jpg" 
            alt="Workspace with notebook and laptop" 
            fill
            unoptimized
            className="absolute inset-0 w-full h-full object-cover grayscale-[30%]" 
          />
          
          <div className="relative z-20 space-y-3 w-full">
            <div className="text-[10px] uppercase tracking-widest text-white/80 font-bold flex items-center gap-1.5">
              YOUR LEARNING JOURNEY
            </div>
            
            <h2 className="text-[clamp(1.5rem,4vw,2.5rem)] font-display font-semibold text-white leading-tight max-w-xl">
              Something to teach.<br/>
              Something <span className="text-[var(--color-accent)]">new to learn.</span>
            </h2>
            
            <div className="mt-5 pt-3 flex flex-col sm:flex-row sm:items-center gap-3 text-xs font-mono font-semibold text-white/90 uppercase border-t border-white/20 inline-flex w-fit">
              <span className="tracking-wide">I CAN TEACH <span className="text-white bg-white/20 px-2 py-0.5 rounded ml-1">{currentUser.teachSkills[0]?.skillName || 'ANYTHING'}</span></span>
              <ArrowRightLeft className="w-3.5 h-3.5 text-white/50 hidden sm:block mx-1" />
              <span className="tracking-wide">I WANT TO LEARN <span className="text-[var(--color-accent)] bg-[var(--color-accent)]/20 px-2 py-0.5 rounded ml-1 mr-1">{currentUser.learnSkills[0]?.skillName || 'SOMETHING NEW'}</span> â†’</span>
            </div>
          </div>
        </div>
        
        {/* Find your skill match section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-display font-semibold text-[var(--color-text)]">
              Find your skill match <span className="text-[var(--color-text-muted)] text-base font-normal">({matches.length})</span>
            </h2>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'best' | 'rating' | 'rate-asc')}
              className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] bg-transparent hover:text-[var(--color-text)] transition-colors outline-none cursor-pointer pr-1"
            >
              <option value="best">Recommended</option>
              <option value="rating">Highest Rated</option>
              <option value="rate-asc">Lowest Rate</option>
            </select>
          </div>
          
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search Input */}
            <div className="relative md:max-w-[280px] w-full shrink-0">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="Search a skill or a fellow learner"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-4 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] outline-none transition-all shadow-sm"
              />
            </div>
            
            {/* Filter Pills */}
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 items-center hide-scrollbar">
              {categories.map(cat => {
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`
                      whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-all cursor-pointer border
                      ${isActive 
                        ? 'bg-[var(--color-chip-active-bg)] text-[var(--color-chip-active-text)] border-transparent' 
                        : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-text-muted)]'}
                    `}
                  >
                    {cat === 'all' ? 'All skills' : cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Skill Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredMatches.length === 0 && (
            <div className="col-span-1 md:col-span-2 py-12 text-center text-[var(--color-text-muted)] border border-dashed border-[var(--color-border)] rounded-2xl">
              No matches found for your criteria.
            </div>
          )}
          
          {filteredMatches.map((match) => {
            // Determine card variant based on theme and index (to alternate slightly if desired, or just use CSS)
            // But per instructions: Dark theme cards: red and charcoal variants. Light theme cards: soft pink and warm taupe variants.
            // A simpler approach: use surface-2 with subtle accent border for swap, and normal surface for direct.
            const isSwap = match.isSwapMatch;
            
            return (
              <div
                key={match.teacher.id}
                className={`
                  group relative rounded-[16px] p-5 transition-all duration-200 flex flex-col justify-between
                  border overflow-hidden
                  ${isSwap 
                    ? 'bg-[var(--color-surface)] border-[var(--color-accent)]/30 hover:border-[var(--color-accent)] shadow-sm' 
                    : 'bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-text-muted)]'}
                `}
              >
                {/* Textured background (faint grid lines) */}
                <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(var(--color-text) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                
                {/* Translucent "NN% match" badge top-right */}
                <div className="absolute top-4 right-4 bg-[var(--color-bg)]/80 backdrop-blur px-2.5 py-1 rounded-md text-[10px] font-bold border border-[var(--color-border)] text-[var(--color-text)] shadow-sm z-10 flex items-center gap-1">
                  <span className="text-[var(--color-accent)]">âœ¦</span> {match.matchScore}% match
                </div>

                {/* Large typographic glyph background */}
                <div className="absolute -right-4 -bottom-4 text-[120px] font-display font-bold text-[var(--color-text)]/5 select-none pointer-events-none leading-none z-0">
                  {match.teacherOfferingSkill.skillName.charAt(0).toUpperCase()}
                </div>

                <div className="relative z-10">
                  {/* Card Header */}
                  <div className="flex items-start gap-3">
                    <Image
                      src={match.teacher.avatarUrl}
                      alt={match.teacher.fullName}
                      width={40}
                      height={40}
                      unoptimized
                      className="h-10 w-10 rounded-full object-cover border border-[var(--color-border)]"
                    />
                    <div>
                      <h3 className="font-sans font-semibold text-[var(--color-text)] text-sm">
                        {match.teacherOfferingSkill.skillName}
                      </h3>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        by {match.teacher.fullName}
                      </p>
                    </div>
                  </div>

                  {/* Bio & Details */}
                  <p className="mt-4 text-xs text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
                    {match.teacher.bio}
                  </p>
                  
                  {isSwap && (
                    <div className="mt-3 text-[11px] font-medium text-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-1 rounded w-fit flex items-center gap-1">
                      <ArrowRightLeft className="w-3 h-3" /> Wants to learn {match.teacher.learnSkills[0]?.skillName || 'what you teach'}
                    </div>
                  )}
                </div>

                {/* Footer: Price & CTA */}
                <div className="mt-5 pt-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3 relative z-10">
                  <div>
                    <div className="text-[9px] text-[var(--color-text-muted)] font-mono uppercase tracking-widest mb-0.5">
                      {isSwap ? 'Swap Cost' : 'Direct Cost'}
                    </div>
                    <div className="text-sm font-semibold text-[var(--color-text)] flex items-baseline gap-1.5">
                      {isSwap ? (
                        <>
                          <span>{match.swapPriceTokens} SP</span>
                          <span className="text-[10px] text-[var(--color-text-muted)] line-through font-normal">{match.directPriceTokens} SP</span>
                        </>
                      ) : (
                        <span>{match.directPriceTokens} SP/hr</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => onSelectMatch(match, isSwap ? 'SWAP' : 'DIRECT')}
                    className={`
                      px-4 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5
                      ${isSwap 
                        ? 'bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-90' 
                        : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'}
                    `}
                  >
                    {isSwap ? <ArrowRightLeft className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                    {isSwap ? 'Swap' : 'Book'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Right Rail: Your week ahead */}
      <aside className="w-full xl:w-[280px] shrink-0">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[16px] p-5 shadow-sm sticky top-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-[var(--color-text-muted)]" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">Your week ahead</h3>
          </div>
          
          {/* Week Range Header (derived) */}
          <div className="flex items-center justify-between text-xs font-medium text-[var(--color-text-muted)] mb-3 pb-3 border-b border-[var(--color-border)]">
            <span>October 2026</span>
            <span>12 â€” 18</span>
          </div>
          
          {/* Day Strip */}
          <div className="flex justify-between items-center mb-5 text-[10px] font-mono">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
              <div 
                key={i} 
                className={`
                  w-6 h-6 flex items-center justify-center rounded-full
                  ${i === 1 ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)]'}
                `}
              >
                {day}
              </div>
            ))}
          </div>
          
          {/* Upcoming Sessions List */}
          <div className="space-y-4">
            {upcomingSessions.length === 0 ? (
              <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
                No upcoming sessions this week.
              </div>
            ) : (
              upcomingSessions.map(session => (
                <div key={session.id} className="relative pl-3 border-l-2 border-[var(--color-accent)] py-1">
                  <div className="text-[9px] uppercase tracking-wider font-bold text-[var(--color-text-muted)] mb-1">
                    {new Date(session.scheduledStart || '').toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  </div>
                  <div className="text-xs font-semibold text-[var(--color-text)] truncate">
                    {session.skillName}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">
                    with {session.teacherId === currentUser.id ? session.learnerName : session.teacherName} Â· {session.durationMinutes}m
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};



