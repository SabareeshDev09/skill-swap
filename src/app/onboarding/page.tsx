'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import SkillPicker from '@/components/SkillPicker';
import { saveProfile, type Profile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, ArrowRight, ArrowRightLeft, Sparkles, Upload, User } from 'lucide-react';

const fieldClass =
  'mt-1.5 w-full rounded-2xl border border-ink/15 bg-mist-pure px-4 py-3 text-sm text-ink outline-none transition-all placeholder:text-ink-muted/50 focus:border-lagoon focus:ring-4 focus:ring-lagoon/10 shadow-sm dark:bg-mist-subtle dark:border-white/15 dark:placeholder:text-ink-muted/40';

const titles = [
  'Tell us about you',
  'What can you teach?',
  'What do you want to learn?',
  'Connect your profiles',
];
const subtitles = [
  'Basic profile details to verify your account identity on the escrow network.',
  'Members who offer a skill pay up to 70% fewer skill points on reciprocal swaps.',
  'Your learning goals connect you with compatible peer teachers across the network.',
  'Build trust in the community by adding your professional credentials.',
];

const calculateAge = (dob: string) => {
  const d = new Date(dob);
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
};

export default function Onboarding() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(1);
  const [err, setErr] = useState('');
  const [langStr, setLangStr] = useState('');
  
  const [f, setF] = useState<Profile>({
    name: '',
    avatar: '',
    sex: '',
    dob: '',
    city: '',
    country: '',
    languages: [],
    teach: [],
    noTeach: false,
    experienceYears: undefined,
    hourlyRate: undefined,
    teachLevel: 'intermediate',
    learn: [],
    learnLevel: 'beginner',
    allowedDurations: [30, 45, 60],
    availability: {},
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    headline: '',
    bio: '',
    githubUrl: '',
    linkedinUrl: '',
    twitterUrl: '',
    websiteUrl: '',
  });

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error || !user) {
          router.replace('/login');
          return;
        }

        // Fetch existing db profile if already initialized
        const { data: dbProfile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url, city, country, bio')
          .eq('id', user.id)
          .maybeSingle();

        // Pull name: check dbProfile, OAuth provider metadata, or derive from email
        const emailPrefix = user.email ? user.email.split('@')[0] : '';
        const cleanedPrefix = emailPrefix.replace(/[._-]+/g, ' ').trim();
        const derivedName = cleanedPrefix
          .split(' ')
          .filter(Boolean)
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ');

        const oauthName = (user.user_metadata?.full_name || user.user_metadata?.name || '').trim();
        const autoName = dbProfile?.full_name || oauthName || derivedName || '';
        const autoAvatar = dbProfile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || '';

        setF(prev => ({
          ...prev,
          name: prev.name || autoName,
          avatar: prev.avatar || autoAvatar,
          city: prev.city || dbProfile?.city || '',
          country: prev.country || dbProfile?.country || '',
          bio: prev.bio || dbProfile?.bio || '',
        }));

        setReady(true);
      } catch {
        if (!cancelled) router.replace('/login');
      }
    };

    checkSession();
    return () => { cancelled = true; };
  }, [router]);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) =>
    setF(p => ({ ...p, [k]: v }));

  const updateAvailability = (day: string, enabled: boolean) => {
    const availability = { ...(f.availability || {}) };
    if (enabled) {
      availability[day] = [];
    } else {
      delete availability[day];
    }
    set('availability', availability);
  };

  const updateAvailabilityTime = (day: string, index: 0 | 1, value: string) => {
    const existing = f.availability?.[day]?.[0]?.split('-') || ['', ''];
    const times: [string, string] = [existing[0] || '', existing[1] || ''];
    times[index] = value;
    const availability = { ...(f.availability || {}) };
    availability[day] = times[0] && times[1] && times[1] > times[0]
      ? [`${times[0]}-${times[1]}`]
      : [];
    set('availability', availability);
  };

  function pickAvatar(file?: File) {
    if (!file) return;
    if (file.size > 1_000_000) return setErr('Please choose a photo under 1 MB.');
    const r = new FileReader();
    r.onload = () => {
      setErr('');
      set('avatar', String(r.result));
    };
    r.readAsDataURL(file);
  }

  function validate() {
    if (step === 1) {
      if (!f.name.trim()) return 'Please enter your full name.';
      if (!f.sex) return 'Please select your sex.';
      if (!f.dob || !(calculateAge(f.dob) >= 18))
        return 'You must be 18 or older to trade on SkillSwap.';
      if (!f.city?.trim() || !f.country?.trim())
        return 'Please enter your city and country.';
      if (!langStr.trim())
        return 'Please enter at least one language you speak.';
    }
    if (step === 2) {
      if (!f.noTeach && f.teach.length === 0)
        return 'Pick at least one skill you can teach, or select "I don\'t have any skills to teach right now".';
      if (!f.noTeach && (f.experienceYears === undefined || f.experienceYears < 0))
        return 'Please enter your years of experience for the skills you teach.';
    }
    if (step === 3 && f.learn.length === 0)
      return 'Pick at least one skill you want to learn.';
    if (step === 4 && !Object.values(f.availability || {}).some((slots) => slots.some((slot) => {
      const [start, end] = slot.split('-');
      return Boolean(start && end && end > start);
    })))
      return 'Set at least one weekly availability window so peers can match with you.';
    return '';
  }

  async function next() {
    const e = validate();
    setErr(e);
    if (e) return;

    if (step === 1) {
      // Parse languages from string
      const langs = langStr.split(',').map(s => s.trim()).filter(Boolean);
      set('languages', langs);
    }

    if (step < 4) {
      setStep(step + 1);
      return;
    }
    
    // Final save
    try {
      await saveProfile({ ...f, name: f.name.trim() });
      router.replace('/dashboard');
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : 'Unable to save your profile.');
    }
  }

  if (!ready) return null;

  return (
    <div className="relative min-h-screen bg-mist selection:bg-lagoon selection:text-white py-12 px-4 sm:px-6 flex items-center justify-center">
      {/* Ambient Lighting Orbs */}
      <div className="pointer-events-none absolute top-10 left-1/3 h-96 w-96 ambient-glow-lagoon opacity-50 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 right-1/3 h-96 w-96 ambient-glow-saffron opacity-40 blur-3xl" />

      <main className="relative z-10 w-full max-w-2xl glass-panel rounded-3xl p-6 sm:p-12 shadow-2xl border border-ink/8">
        {/* Step Indicator Header with SkillSwap Logo Link */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/8 pb-5">
          <Link href="/" className="inline-flex items-center gap-2 group cursor-pointer" title="Back to Home">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white dark:bg-saffron dark:text-black group-hover:bg-lagoon transition-colors shadow-sm">
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </div>
            <span className="font-display text-base font-extrabold tracking-tight text-ink">
              SkillSwap
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-lagoon uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5 text-saffron" />
              <span>Step {step} of 4</span>
            </div>
            <div className="text-xs text-ink/40 font-mono hidden sm:block">
              {Math.round((step / 4) * 100)}% Completed
            </div>
          </div>
        </div>

        {/* Minimal Progress Bar */}
        <div className="mt-3 h-1.5 w-full bg-ink/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-lagoon transition-all duration-300 ease-out rounded-full"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        <div className="mt-8">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
            {titles[step - 1]}
          </h1>
          <p className="mt-2 text-sm text-ink/70 leading-relaxed font-normal">
            {subtitles[step - 1]}
          </p>
        </div>

        <div className="mt-8 space-y-5">
          {step === 1 && (
            <>
              {/* Avatar Uploader */}
              <div className="flex items-center gap-5 p-4 rounded-2xl bg-mist-pure/60 border border-ink/8">
                {f.avatar ? (
                  <Image
                    src={f.avatar}
                    alt="Your profile picture"
                    width={80}
                    height={80}
                    unoptimized
                    className="size-20 rounded-2xl object-cover border-2 border-lagoon shadow-sm"
                  />
                ) : (
                  <div className="grid size-20 place-items-center rounded-2xl bg-ink/5 border border-ink/10 font-display text-2xl font-bold text-ink">
                    {f.name.trim()[0]?.toUpperCase() ?? <User className="h-8 w-8 text-ink/40" />}
                  </div>
                )}
                <div>
                  <label className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-ink/20 bg-mist-pure px-4 py-2 text-xs font-semibold text-ink hover:bg-ink hover:text-white dark:hover:bg-saffron dark:hover:text-black dark:hover:border-saffron transition-colors shadow-sm">
                    <Upload className="h-3.5 w-3.5" />
                    <span>{f.avatar ? 'Change photo' : 'Upload photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={e => pickAvatar(e.target.files?.[0])}
                    />
                  </label>
                  <p className="mt-1.5 text-[11px] text-ink/50">PNG, JPG up to 1 MB.</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink block">
                  Full name / Display name
                  <input
                    value={f.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="Enter your preferred full name"
                    autoComplete="name"
                    className={fieldClass}
                  />
                </label>
                <p className="mt-1 text-[11px] text-ink/50">
                  Suggested from your account email. You can freely change or customize your name.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-ink block">
                    Sex
                    <select
                      value={f.sex}
                      onChange={e => set('sex', e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Select option</option>
                      <option>Female</option>
                      <option>Male</option>
                      <option>Prefer not to say</option>
                    </select>
                  </label>
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink block">
                    Date of birth (18+ only)
                    <input
                      type="date"
                      value={f.dob}
                      onChange={e => set('dob', e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      autoComplete="bday"
                      className={fieldClass}
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-ink block">
                    City
                    <input
                      value={f.city}
                      onChange={e => set('city', e.target.value)}
                      placeholder="e.g. Bangalore"
                      className={fieldClass}
                    />
                  </label>
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink block">
                    Country
                    <input
                      value={f.country}
                      onChange={e => set('country', e.target.value)}
                      placeholder="e.g. India"
                      className={fieldClass}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink block">
                  Languages you speak
                  <input
                    value={langStr}
                    onChange={e => setLangStr(e.target.value)}
                    placeholder="e.g. English, Hindi, Tamil"
                    className={fieldClass}
                  />
                </label>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <SkillPicker
                value={f.teach}
                onChange={v => set('teach', v)}
                max={5}
                disabled={f.noTeach}
              />

              <label className="flex items-center gap-3 rounded-2xl bg-mist-pure/80 p-4 border border-ink/8 font-medium text-xs text-ink cursor-pointer hover:border-ink/20 transition-all select-none shadow-sm">
                <input
                  type="checkbox"
                  checked={f.noTeach}
                  className="size-4 rounded accent-lagoon cursor-pointer"
                  onChange={e =>
                    setF(p => ({
                      ...p,
                      noTeach: e.target.checked,
                      teach: e.target.checked ? [] : p.teach,
                      experienceYears: e.target.checked ? undefined : p.experienceYears,
                    }))
                  }
                />
                <span>I don&apos;t have any skills to teach right now (Learn-only mode)</span>
              </label>

              {!f.noTeach && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-mist-pure/60 border border-ink/8">
                  <div>
                    <label className="text-xs font-semibold text-ink block">
                      Teaching Level
                      <select
                        value={f.teachLevel}
                        onChange={e => set('teachLevel', e.target.value as Profile['teachLevel'])}
                        className={fieldClass}
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                        <option value="expert">Expert</option>
                      </select>
                    </label>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink block">
                      Years of Experience
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={f.experienceYears === undefined ? '' : f.experienceYears}
                        onChange={e => set('experienceYears', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="e.g. 3"
                        className={fieldClass}
                      />
                    </label>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink block">
                      Hourly Rate (Skill Points)
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={f.hourlyRate === undefined ? '' : f.hourlyRate}
                        onChange={e => set('hourlyRate', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="e.g. 15"
                        className={fieldClass}
                      />
                    </label>
                  </div>
                </div>
              )}

              {f.noTeach && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
                  <strong>Notice:</strong> In learn-only mode, you pay the teacher&apos;s full list price in skill points. You can add a teachable skill anytime later to unlock up to 70% swap discounts.
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <label className="text-xs font-semibold text-ink block">
                Target learning level
                <select
                  value={f.learnLevel}
                  onChange={e => set('learnLevel', e.target.value as Profile['learnLevel'])}
                  className={fieldClass}
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </select>
              </label>
              <SkillPicker value={f.learn} onChange={v => set('learn', v)} max={5} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold text-ink">Weekly availability</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                    const selected = Object.hasOwn(f.availability || {}, day);
                    const [start = '', end = ''] = f.availability?.[day]?.[0]?.split('-') || [];
                    return (
                      <div key={day} className="flex items-center gap-2 rounded-xl border border-ink/10 p-3">
                        <input
                          id={`availability-${day}`}
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => updateAvailability(day, event.target.checked)}
                          className="size-4 accent-lagoon"
                        />
                        <label htmlFor={`availability-${day}`} className="w-24 text-xs font-medium text-ink">{day}</label>
                        <input
                          aria-label={`${day} start time`}
                          type="time"
                          value={start}
                          disabled={!selected}
                          onChange={(event) => updateAvailabilityTime(day, 0, event.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-mist-pure px-2 py-1 text-xs text-ink disabled:opacity-40"
                        />
                        <span className="text-xs text-ink/50">to</span>
                        <input
                          aria-label={`${day} end time`}
                          type="time"
                          value={end}
                          disabled={!selected}
                          onChange={(event) => updateAvailabilityTime(day, 1, event.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-mist-pure px-2 py-1 text-xs text-ink disabled:opacity-40"
                        />
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              <div>
                <label className="text-xs font-semibold text-ink block">
                  Professional Headline
                  <input
                    value={f.headline}
                    onChange={e => set('headline', e.target.value)}
                    placeholder="e.g. Senior Frontend Developer at TechCorp"
                    className={fieldClass}
                  />
                </label>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink block">
                  Short Bio
                  <textarea
                    value={f.bio}
                    onChange={e => set('bio', e.target.value)}
                    placeholder="Tell the community a bit about yourself..."
                    className={`${fieldClass} resize-none h-24`}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-ink block">
                    LinkedIn Profile URL
                    <input
                      type="url"
                      value={f.linkedinUrl}
                      onChange={e => set('linkedinUrl', e.target.value)}
                      placeholder="https://linkedin.com/in/..."
                      className={fieldClass}
                    />
                  </label>
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink block">
                    GitHub Profile URL
                    <input
                      type="url"
                      value={f.githubUrl}
                      onChange={e => set('githubUrl', e.target.value)}
                      placeholder="https://github.com/..."
                      className={fieldClass}
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-ink block">
                    Twitter Profile URL
                    <input
                      type="url"
                      value={f.twitterUrl}
                      onChange={e => set('twitterUrl', e.target.value)}
                      placeholder="https://twitter.com/..."
                      className={fieldClass}
                    />
                  </label>
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink block">
                    Personal Website
                    <input
                      type="url"
                      value={f.websiteUrl}
                      onChange={e => set('websiteUrl', e.target.value)}
                      placeholder="https://yourdomain.com"
                      className={fieldClass}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {err && (
            <div
              role="alert"
              className="rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 p-3.5 text-xs font-medium text-red-700 dark:text-red-300"
            >
              {err}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between pt-6 border-t border-ink/8 mt-4">
            <button
              type="button"
              onClick={() => {
                setErr('');
                setStep(step - 1);
              }}
              disabled={step === 1}
              className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-semibold text-ink/70 hover:text-ink hover:bg-mist-pure disabled:invisible transition-all cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-2 rounded-full bg-lagoon px-8 py-3 text-xs font-semibold text-white hover:bg-lagoon-dark transition-all shadow-lg shadow-lagoon/20 hover:shadow-xl cursor-pointer"
            >
              <span>{step === 4 ? 'Complete & View Matches' : 'Next Step'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
