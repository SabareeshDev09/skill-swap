'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSession, signOut } from '@/lib/auth';
import { createClient } from '@/lib/supabase/client';
import { ArrowRight, Sparkles, ShieldCheck, Zap, ArrowRightLeft, Lock } from 'lucide-react';

const steps = [
  {
    num: '01',
    title: 'Declare your exchange vectors',
    desc: 'List what you can teach and what you want to learn. Our matching engine identifies reciprocal swap matches in seconds.',
  },
  {
    num: '02',
    title: 'Lock skill points in escrow',
    desc: 'Swapping reduces in-kind costs by up to 70%. Your skill points remain safely locked in escrow until the session completes.',
  },
  {
    num: '03',
    title: 'Meet on Google Meet & settle',
    desc: 'One-click automated Google Meet links. Both parties confirm completion, triggering instant atomic escrow payout.',
  },
];

export default function Landing() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const demoSession = getSession();
    if (demoSession) queueMicrotask(() => { if (!cancelled) setIsLoggedIn(true); });
    createClient().auth.getUser().then(({ data, error }) => {
      if (!cancelled && !error && data.user) setIsLoggedIn(true);
    }).catch(() => {
      if (!cancelled) setIsLoggedIn(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="relative min-h-screen bg-mist text-ink selection:bg-lagoon selection:text-white overflow-hidden">
      {/* Ambient Spatial Lighting Orbs */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[900px] ambient-glow-lagoon opacity-60 blur-3xl" />
      <div className="pointer-events-none absolute top-[500px] -right-40 h-[600px] w-[600px] ambient-glow-saffron opacity-50 blur-3xl" />

      {/* Floating Spatial Navigation Dock */}
      <header className="sticky top-5 z-40 mx-auto max-w-5xl px-4 sm:px-6">
        <div className="spatial-dock rounded-full px-5 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white dark:bg-saffron dark:text-black group-hover:bg-lagoon transition-colors shadow-sm">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-ink">
              SkillSwap
            </span>
            <span className="hidden sm:inline-block rounded-full bg-lagoon/10 border border-lagoon/20 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-lagoon dark:bg-saffron/10 dark:border-saffron/20 dark:text-saffron">
              ESCROW v0.2
            </span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3">
            {isLoggedIn ? (
              <>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-xs font-semibold text-white hover:bg-lagoon transition-all shadow-sm group dark:bg-saffron dark:text-black dark:hover:bg-saffron-light"
                >
                  <span>Dashboard</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <button
                  onClick={() => {
                    signOut();
                    setIsLoggedIn(false);
                  }}
                  className="rounded-full px-3.5 py-2 text-xs font-medium text-ink/70 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-full px-4 py-2 text-xs font-semibold text-ink/80 hover:text-ink hover:bg-mist-pure/80 transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-ink px-5 py-2 text-xs font-semibold text-white hover:bg-lagoon transition-all shadow-sm dark:bg-saffron dark:text-black dark:hover:bg-saffron-light"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Spatial Section */}
      <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-28 md:pt-28 md:pb-36">
        <div className="grid gap-14 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Editorial Headline & Value Prop */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full glass-pill px-3.5 py-1 text-xs font-mono font-semibold text-lagoon">
              <Sparkles className="h-3.5 w-3.5 text-saffron" />
              PEER-TO-PEER SKILL EXCHANGE & ESCROW NETWORK
            </div>

            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-ink leading-[1.03]">
              Teach one thing.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-lagoon via-teal-700 to-ink">
                Learn another.
              </span>
            </h1>

            <p className="max-w-xl text-lg text-ink/75 leading-relaxed font-normal">
              Trade verified 1:1 lessons with peers who seek what you already know. When skills are exchanged in kind, learning costs up to <strong className="text-ink font-semibold">70% fewer skill points</strong> backed by automated escrow.
            </p>

            {/* Spatial CTA Actions */}
            <div className="pt-2 flex flex-wrap items-center gap-4">
              {isLoggedIn ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2.5 rounded-full bg-lagoon px-8 py-3.5 text-sm font-semibold text-white hover:bg-lagoon-dark transition-all shadow-lg shadow-lagoon/20 hover:shadow-xl hover:shadow-lagoon/25 group"
                >
                  <span>Enter Dashboard</span>
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              ) : (
                <>
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2.5 rounded-full bg-lagoon px-8 py-3.5 text-sm font-semibold text-white hover:bg-lagoon-dark transition-all shadow-lg shadow-lagoon/20 hover:shadow-xl hover:shadow-lagoon/25 group"
                  >
                    <span>Create Free Account</span>
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Link>

                  <Link
                    href="/login"
                    className="rounded-full border border-ink/20 glass-pill px-7 py-3.5 text-sm font-semibold text-ink hover:bg-mist-pure transition-all shadow-sm"
                  >
                    I already have an account
                  </Link>
                </>
              )}
            </div>

            {/* Trust Markers */}
            <div className="pt-6 flex flex-wrap items-center gap-6 text-xs text-ink/60 border-t border-ink/10">
              <span className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="h-4 w-4 text-lagoon" />
                Escrow Protected Payouts
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <Lock className="h-4 w-4 text-lagoon" />
                1 Skill Point = SP1 Guaranteed
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <Zap className="h-4 w-4 text-saffron" />
                Automated Google Meet
              </span>
            </div>
          </div>

          {/* Right Column: Spatial Floating Comparison Tile */}
          <div className="lg:col-span-5 relative">
            <div className="glass-panel rounded-[16px] p-7 text-ink spatial-card shadow-2xl relative overflow-hidden bg-[var(--color-surface)] border border-[var(--color-border)]">
              {/* Subtle top edge specular highlight */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/5 to-transparent dark:via-white/10" />
              
              <div className="flex items-center justify-between border-b border-ink/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-ink/5 text-saffron font-bold text-sm">
                    PY
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-ink">Python Async & FastApi</h3>
                    <p className="text-[11px] text-ink/60">Taught by Verified Peer • 60 mins</p>
                  </div>
                </div>
                <span className="rounded-full bg-lagoon/10 border border-lagoon/20 px-2.5 py-0.5 text-[10px] font-mono font-bold text-lagoon dark:text-teal-300">
                  70% DISCOUNT
                </span>
              </div>

              {/* Price Bars Comparison */}
              <div className="mt-6 space-y-5">
                <div>
                  <div className="flex justify-between text-xs font-mono text-ink/70 mb-2">
                    <span>Direct Learn (List Price)</span>
                    <span className="text-ink font-bold">60 SP (SP60)</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-ink/5 overflow-hidden">
                    <div className="h-full w-full bg-ink/10 rounded-full" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono text-saffron mb-2">
                    <span className="font-bold flex items-center gap-1">
                      <ArrowRightLeft className="h-3 w-3" />
                      Swap: You teach him Figma UI
                    </span>
                    <span className="font-extrabold text-ink text-sm">18 SP (SP18)</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-ink/5 overflow-hidden">
                    <div className="h-full w-[30%] bg-saffron rounded-full shadow-lg shadow-saffron/40" />
                  </div>
                </div>
              </div>

              {/* Savings Card Insight */}
              <div className="mt-6 rounded-[12px] bg-ink/5 border border-ink/10 p-4 flex items-center justify-between text-xs">
                <div>
                  <div className="text-ink/60 text-[11px]">Net Savings per Session</div>
                  <div className="text-emerald-600 dark:text-emerald-400 font-bold font-mono text-base">You Save 42 Skill Points</div>
                </div>
                <div className="text-right">
                  <div className="text-ink/60 text-[11px]">Rate in INR</div>
                  <div className="text-ink font-mono font-bold text-base">SP18 only</div>
                </div>
              </div>

              <p className="mt-5 text-[11px] text-ink/50 text-center leading-relaxed font-mono">
                Skill points stay in escrow until both parties confirm completion.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Spatial Workflow Architecture Grid */}
      <section className="relative z-10 border-t border-ink/8 bg-mist-pure/60 backdrop-blur-xl py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-xl">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-lagoon">
              Architecture & Mechanics • How this product functions
            </span>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
              How skill swap works.
            </h2>
            <p className="mt-3 text-sm text-ink/70 leading-relaxed">
              Designed around complete financial integrity, mutual scheduling convenience, and verifiable escrow protection.
            </p>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {steps.map(step => (
              <div
                key={step.num}
                className="group relative rounded-3xl glass-panel p-8 spatial-card flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-3xl font-black text-ink/15 group-hover:text-lagoon/40 transition-colors">
                      {step.num}
                    </span>
                    <div className="h-2 w-2 rounded-full bg-lagoon/30 group-hover:bg-lagoon transition-colors" />
                  </div>
                  <h3 className="mt-6 font-display text-lg font-bold text-ink leading-snug">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm text-ink/70 leading-relaxed font-normal">
                    {step.desc}
                  </p>
                </div>

                <div className="mt-8 pt-4 border-t border-ink/5 flex items-center gap-2 text-xs font-semibold text-lagoon group-hover:translate-x-1 transition-transform">
                  <span>Learn more</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink/10 bg-mist-pure/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-7 px-6 py-8 sm:py-10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3 text-left">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-white dark:bg-saffron dark:text-black">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div className="flex flex-col gap-1 text-xs leading-relaxed text-ink/65">
              <span className="font-semibold text-ink">SkillSwap Platform</span>
              <span>18+ members only · Stored value protected by double-entry ledger.</span>
              <span className="text-ink/45">© {new Date().getFullYear()} SkillSwap. All rights reserved.</span>
            </div>
          </div>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-6 gap-y-2 pl-11 text-xs font-semibold text-ink/65 md:pl-0">
            <Link href="/privacy" className="transition-colors hover:text-lagoon focus-visible:text-lagoon">Privacy Policy</Link>
            <Link href="/terms" className="transition-colors hover:text-lagoon focus-visible:text-lagoon">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
