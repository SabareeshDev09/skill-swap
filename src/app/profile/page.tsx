'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowRightLeft,
  Camera,
  Upload,
  Sparkles,
  Check,
  X,
  RefreshCw,
  Globe,
  MapPin,
  Clock,
  Briefcase,
  Star,
  ShieldCheck,
  Coins,
  Save,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  saveProfile,
  deriveNameFromEmail,
  Profile as AuthProfile
} from '@/lib/auth';
import { createClient } from '@/lib/supabase/client';
import type { SkillItem } from '@/types';
import { normalizeSkillName, uniqueSkillNames } from '@/lib/skills';

// Curated avatar presets with high resolution and diverse styles
const AVATAR_PRESETS = [
  { name: 'Custom Avatar 1', url: '/avatars/avatar_1.jpg' },
  { name: 'Custom Avatar 2', url: '/avatars/avatar_2.jpg' },
  { name: 'Custom Avatar 3', url: '/avatars/avatar_3.jpg' },
  { name: 'Custom Avatar 4', url: '/avatars/avatar_4.jpg' },
  { name: 'Custom Avatar 5', url: '/avatars/avatar_5.jpg' },
  { name: 'Custom Avatar 6', url: '/avatars/avatar_6.jpg' },
  { name: 'Custom Avatar 7', url: '/avatars/avatar_7.jpg' },
  { name: 'Custom Avatar 8', url: '/avatars/avatar_8.jpg' },
  { name: 'Custom Avatar 9', url: '/avatars/avatar_9.jpg' },
  { name: 'Custom Avatar 10', url: '/avatars/avatar_10.jpg' },
  { name: 'Custom Avatar 11', url: '/avatars/avatar_11.jpg' },
  { name: 'Custom Avatar 12', url: '/avatars/avatar_12.jpg' },
  { name: 'Custom Avatar 13', url: '/avatars/avatar_13.jpg' },
  { name: 'Custom Avatar 14', url: '/avatars/avatar_14.jpg' },
  { name: 'Custom Avatar 15', url: '/avatars/avatar_15.jpg' },
  { name: 'Custom Avatar 16', url: '/avatars/avatar_16.jpg' },
  { name: 'Custom Avatar 17', url: '/avatars/avatar_17.jpg' },
  { name: 'Custom Avatar 18', url: '/avatars/avatar_18.jpg' },
];

const TIMEZONE_OPTIONS = [
  'Asia/Kolkata (IST +5:30)',
  'UTC (Coordinated Universal Time)',
  'America/New_York (EST -5:00)',
  'America/Los_Angeles (PST -8:00)',
  'America/Chicago (CST -6:00)',
  'Europe/London (GMT +0:00)',
  'Europe/Berlin (CET +1:00)',
  'Asia/Singapore (SGT +8:00)',
  'Asia/Tokyo (JST +9:00)',
  'Australia/Sydney (AEST +10:00)',
];

const COMMON_LANGUAGES = [
  'English', 'Hindi', 'Spanish', 'French', 'German', 'Mandarin', 'Japanese', 'Tamil', 'Kannada', 'Bengali', 'Portuguese'
];

const DAYS_OF_WEEK = [
  { key: 'Mon', label: 'Monday' },
  { key: 'Tue', label: 'Tuesday' },
  { key: 'Wed', label: 'Wednesday' },
  { key: 'Thu', label: 'Thursday' },
  { key: 'Fri', label: 'Friday' },
  { key: 'Sat', label: 'Saturday' },
  { key: 'Sun', label: 'Sunday' },
];

const TIME_SLOTS = [
  { key: 'morning', label: 'Morning (9:00 - 12:00)' },
  { key: 'afternoon', label: 'Afternoon (13:00 - 17:00)' },
  { key: 'evening', label: 'Evening (18:00 - 21:00)' },
];

const EMPTY_PROFILE: AuthProfile = {
  name: '',
  avatar: '/avatars/avatar_1.jpg',
  sex: '',
  dob: '',
  teach: [],
  noTeach: true,
  learn: [],
  languages: [],
  availability: {},
};

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'skills' | 'availability' | 'social'>('profile');

  // Form State
  const [profile, setProfile] = useState<AuthProfile>(EMPTY_PROFILE);

  // Avatar Editor State
  const [avatarMode, setAvatarMode] = useState<'presets' | 'upload' | 'url'>('presets');
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [avatarError, setAvatarError] = useState('');

  // Skill Add inputs
  const [newTeachSkill, setNewTeachSkill] = useState('');
  const [newLearnSkill, setNewLearnSkill] = useState('');
  const [newLanguage, setNewLanguage] = useState('');
  const [skillSuggestions, setSkillSuggestions] = useState<string[]>([]);

  // Load profile on mount
  useEffect(() => {
    const initProfile = async () => {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.replace('/login');
        return;
      }

      const skillsResponse = await fetch('/api/skills');
      if (skillsResponse.ok) {
        const { skills } = await skillsResponse.json() as { skills: SkillItem[] };
        setSkillSuggestions(skills.map((skill) => skill.name).slice(0, 8));
      }

      const { data: dbProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        setLoading(false);
        return;
      }

      if (!dbProfile || !dbProfile.is_onboarded) {
        router.replace('/onboarding');
        return;
      }

      const [teachRes, learnRes] = await Promise.all([
        supabase.from('user_skills_teach').select('hourly_rate, years_experience, allowed_durations, level, skill_taxonomy(name)').eq('user_id', user.id),
        supabase.from('user_skills_learn').select('target_level, skill_taxonomy(name)').eq('user_id', user.id),
      ]);
      if (teachRes.error || learnRes.error) {
        console.error('Load profile skills error:', teachRes.error || learnRes.error);
        setSaveError('Unable to load your saved skills. Please refresh the page and try again.');
        setLoading(false);
        return;
      }
      const teachRows = (teachRes.data || []) as unknown as Array<{
        hourly_rate: number;
        years_experience: number | null;
        allowed_durations: number[] | null;
        level: AuthProfile['teachLevel'] | null;
        skill_taxonomy: { name?: string } | null;
      }>;
      const learnRows = (learnRes.data || []) as unknown as Array<{
        target_level: AuthProfile['learnLevel'] | null;
        skill_taxonomy: { name?: string } | null;
      }>;
      const teachSkills = teachRows.map((skill) => skill.skill_taxonomy?.name || '').filter(Boolean);
      const learnSkills = learnRows.map((skill) => skill.skill_taxonomy?.name || '').filter(Boolean);
      const saved: AuthProfile = {
        name: dbProfile.full_name || deriveNameFromEmail(user.email) || '',
        avatar: dbProfile.avatar_url || '/avatars/avatar_1.jpg',
        sex: '',
        dob: '',
        teach: teachSkills,
        noTeach: teachSkills.length === 0,
        learn: learnSkills,
        bio: dbProfile.bio || '',
        city: dbProfile.city || '',
        country: dbProfile.country || '',
        timezone: dbProfile.timezone || 'UTC',
        languages: dbProfile.languages || [],
        availability: dbProfile.availability || {},
        hourlyRate: teachRows[0]?.hourly_rate,
        experienceYears: teachRows[0]?.years_experience ?? undefined,
        allowedDurations: teachRows[0]?.allowed_durations || undefined,
        teachLevel: teachRows[0]?.level || undefined,
        learnLevel: learnRows[0]?.target_level || undefined,
        isAcceptingRequests: dbProfile.is_accepting_requests !== false,
      };
      setProfile(saved);
      setCustomAvatarUrl(saved.avatar);
      setLoading(false);
    };

    initProfile();
  }, [router]);

  // Update field helper
  const updateField = <K extends keyof AuthProfile>(key: K, val: AuthProfile[K]) => {
    setProfile(prev => ({
      ...prev,
      [key]: val,
    }));
  };

  // Avatar Handlers
  const handleSelectPreset = (url: string) => {
    updateField('avatar', url);
    setAvatarError('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('Image size exceeds 2 MB. Please upload a smaller photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateField('avatar', reader.result);
        setAvatarError('');
      }
    };
    reader.onerror = () => {
      setAvatarError('Failed to read image file. Please try another.');
    };
    reader.readAsDataURL(file);
  };

  const handleApplyCustomUrl = () => {
    const trimmed = customAvatarUrl.trim();
    if (!trimmed) {
      setAvatarError('Please enter a valid image URL.');
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:image')) {
      setAvatarError('URL must start with http:// or https://');
      return;
    }
    updateField('avatar', trimmed);
    setAvatarError('');
  };

  const handleGenerateRandomAvatar = () => {
    const randomIndex = Math.floor(Math.random() * 18) + 1;
    const generated = `/avatars/avatar_${randomIndex}.jpg`;
    updateField('avatar', generated);
    setAvatarError('');
  };

  const handleResetAvatar = () => {
    updateField('avatar', '/avatars/avatar_1.jpg');
    setAvatarError('');
  };

  // Skills management
  const handleAddTeachSkill = (skill: string) => {
    const s = skill.trim();
    if (!s) return;
    const teach = uniqueSkillNames([...profile.teach, s]);
    if (teach.length === profile.teach.length) return;
    updateField('teach', teach);
    updateField('noTeach', false);
    setNewTeachSkill('');
  };

  const handleRemoveTeachSkill = (skill: string) => {
    updateField('teach', profile.teach.filter(x => normalizeSkillName(x) !== normalizeSkillName(skill)));
  };

  const handleAddLearnSkill = (skill: string) => {
    const s = skill.trim();
    if (!s) return;
    const learn = uniqueSkillNames([...profile.learn, s]);
    if (learn.length === profile.learn.length) return;
    updateField('learn', learn);
    setNewLearnSkill('');
  };

  const handleRemoveLearnSkill = (skill: string) => {
    updateField('learn', profile.learn.filter(x => normalizeSkillName(x) !== normalizeSkillName(skill)));
  };

  // Language management
  const handleToggleLanguage = (lang: string) => {
    const current = profile.languages || ['English'];
    if (current.includes(lang)) {
      if (current.length > 1) {
        updateField('languages', current.filter(l => l !== lang));
      }
    } else {
      updateField('languages', [...current, lang]);
    }
  };

  const handleAddCustomLanguage = () => {
    const l = newLanguage.trim();
    if (!l) return;
    const current = profile.languages || ['English'];
    if (!current.includes(l)) {
      updateField('languages', [...current, l]);
    }
    setNewLanguage('');
  };

  // Availability matrix
  const currentAvailability = profile.availability || {};

  const handleToggleAvailabilitySlot = (day: string, slotLabel: string) => {
    const daySlots = currentAvailability[day] ? [...currentAvailability[day]] : [];
    const exists = daySlots.includes(slotLabel);
    const updated = exists ? daySlots.filter(s => s !== slotLabel) : [...daySlots, slotLabel];

    updateField('availability', {
      ...currentAvailability,
      [day]: updated,
    });
  };

  // Save changes
  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const updatedProfile = {
        ...profile,
        name: profile.name.trim(),
      };
      await saveProfile(updatedProfile);
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
      });
      setSuccessToast(true);
      setTimeout(() => setSuccessToast(false), 4000);
    } catch (err) {
      console.error('Save profile error:', err);
      setSaveError(err instanceof Error ? err.message : 'Unable to save your profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-mist flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-lagoon border-t-transparent" />
          <span className="text-sm font-medium text-ink-muted">Loading your profile...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-mist selection:bg-lagoon selection:text-white pb-20">
      {/* Ambient Lighting Orbs */}
      <div className="pointer-events-none absolute top-10 left-1/4 h-[450px] w-[450px] ambient-glow-lagoon opacity-40 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 right-10 h-[500px] w-[500px] ambient-glow-saffron opacity-35 blur-3xl" />

      {/* Top Floating Header */}
      <header className="sticky top-4 z-40 mx-auto max-w-6xl px-4 sm:px-6">
        <div className="spatial-dock rounded-2xl px-5 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 group text-ink hover:text-lagoon transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/5 dark:bg-white/10 group-hover:bg-lagoon group-hover:text-white transition-all">
                <ArrowLeft className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider hidden sm:inline">
                Back to Dashboard
              </span>
            </Link>

            <div className="h-4 w-px bg-ink/10" />

            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white dark:bg-saffron dark:text-black">
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </div>
              <span className="font-display font-bold text-ink text-sm sm:text-base">
                SkillSwap Profile
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-lagoon active:scale-95 transition-all dark:bg-saffron dark:text-black dark:hover:bg-saffron-light cursor-pointer"
            >
              {saving ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Success Toast */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-ink px-5 py-3.5 text-white shadow-2xl dark:bg-mist-pure dark:text-ink dark:border dark:border-white/10 animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <div className="text-xs">
            <div className="font-bold">Profile Updated!</div>
            <div className="text-ink-muted dark:text-white/60">Your avatar and settings were saved successfully.</div>
          </div>
        </div>
      )}
      {saveError && (
        <div role="alert" className="fixed bottom-6 right-6 z-50 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-xs font-medium text-rose-700 shadow-xl dark:border-rose-900/40 dark:bg-rose-950/70 dark:text-rose-300">
          {saveError}
        </div>
      )}

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
        {/* Profile Hero Header Card */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 mb-8 border border-ink/8 shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-8">
            {/* Main Avatar with Quick Ring & Status */}
            <div className="relative group">
              <div className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-full overflow-hidden border-4 border-mist-pure shadow-xl ring-4 ring-lagoon/20 bg-mist">
                <Image
                  src={profile.avatar || '/avatars/avatar_1.jpg'}
                  alt={profile.name}
                  width={128}
                  height={128}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              </div>

              {/* Status Badge */}
              <div
                className="absolute bottom-1 right-1 h-7 w-7 rounded-full bg-emerald-500 border-2 border-mist-pure flex items-center justify-center text-white shadow-md"
                title="Active on Escrow Network"
              >
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>

            {/* User Meta Summary */}
            <div className="flex-1 text-center md:text-left space-y-2">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
                  {profile.name || 'Your Name'}
                </h1>
                <span className="rounded-full bg-lagoon/10 px-3 py-0.5 text-xs font-bold text-lagoon border border-lagoon/20">
                  {profile.noTeach ? 'Learner Only' : 'Verified Mentor'}
                </span>
                <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  5.0 (Peer Rated)
                </span>
              </div>

              <p className="text-sm font-medium text-ink/75 max-w-xl">
                {profile.headline || 'Full-Stack Engineer & Interaction Designer'}
              </p>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs text-ink/60 pt-1">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-lagoon" />
                  <span>{profile.city || 'Bengaluru'}, {profile.country || 'IN'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  <span>{profile.timezone || 'Asia/Kolkata (IST)'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Rate: <strong>{profile.hourlyRate || 50} SP/hr</strong></span>
                </div>
              </div>
            </div>

            {/* Quick Stats Block */}
            <div className="hidden lg:flex flex-col gap-2.5 min-w-[260px] rounded-2xl bg-mist-pure/60 p-5 border border-ink/8 text-xs">
              <div className="flex items-center justify-between gap-4">
                <span className="text-ink/60">Swaps Completed</span>
                <span className="font-mono font-bold text-ink whitespace-nowrap">14 Sessions</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-ink/60">Escrow Security</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">100% Guaranteed</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-ink/60">Account Standing</span>
                <span className="font-semibold text-lagoon whitespace-nowrap">0 Strikes</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 scrollbar-none">
          {[
            { id: 'profile', label: 'Avatar & Identity', icon: Camera },
            { id: 'skills', label: 'Teaching & Learning Skills', icon: Briefcase },
            { id: 'availability', label: 'Weekly Availability', icon: Calendar },
            { id: 'social', label: 'Social & Credentials', icon: Globe },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'profile' | 'skills' | 'availability' | 'social')}
                className={`flex items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? 'bg-ink text-white shadow-md dark:bg-saffron dark:text-black'
                    : 'glass-panel text-ink/70 hover:text-ink hover:bg-mist-pure/80'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: AVATAR & IDENTITY */}
        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Avatar Customizer Suite */}
            <div className="lg:col-span-5 space-y-6">
              <div className="glass-panel rounded-3xl p-6 sm:p-7 border border-ink/8 shadow-sm">
                <div className="flex items-center justify-between border-b border-ink/8 pb-4 mb-5">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-lagoon" />
                    <h2 className="font-display text-base font-bold text-ink">Avatar Customizer</h2>
                  </div>
                  <button
                    onClick={handleGenerateRandomAvatar}
                    className="flex items-center gap-1.5 text-xs font-semibold text-lagoon hover:text-lagoon-dark transition-colors cursor-pointer"
                    title="Generate a randomized avatar"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Shuffle</span>
                  </button>
                </div>

                {/* Avatar Preview & Actions */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative h-20 w-20 rounded-full overflow-hidden border-2 border-ink/10 shadow-md flex-shrink-0 bg-mist">
                    <Image
                      src={profile.avatar || '/avatars/avatar_1.jpg'}
                      alt="Avatar Preview"
                      width={80}
                      height={80}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <p className="text-xs font-bold text-ink">Active Avatar</p>
                    <p className="text-[11px] text-ink-muted leading-relaxed">
                      Choose from curated presets, upload a photo, or paste any image URL.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleResetAvatar}
                        className="text-[11px] text-ink-muted hover:text-rose-600 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Reset to default</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Avatar Mode Selector */}
                <div className="flex items-center rounded-xl bg-ink/5 p-1 mb-5">
                  <button
                    onClick={() => setAvatarMode('presets')}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      avatarMode === 'presets'
                        ? 'bg-mist-pure text-ink shadow-xs dark:bg-mist-subtle'
                        : 'text-ink/60 hover:text-ink'
                    }`}
                  >
                    Curated Presets
                  </button>
                  <button
                    onClick={() => setAvatarMode('upload')}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      avatarMode === 'upload'
                        ? 'bg-mist-pure text-ink shadow-xs dark:bg-mist-subtle'
                        : 'text-ink/60 hover:text-ink'
                    }`}
                  >
                    Upload Photo
                  </button>
                  <button
                    onClick={() => setAvatarMode('url')}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      avatarMode === 'url'
                        ? 'bg-mist-pure text-ink shadow-xs dark:bg-mist-subtle'
                        : 'text-ink/60 hover:text-ink'
                    }`}
                  >
                    Image URL
                  </button>
                </div>

                {/* Error Banner */}
                {avatarError && (
                  <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:border-rose-900/40 dark:text-rose-300 mb-4">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{avatarError}</span>
                  </div>
                )}

                {/* MODE 1: Curated Presets Grid */}
                {avatarMode === 'presets' && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">
                      Pick a persona
                    </p>
                    <div className="grid grid-cols-4 gap-3 max-h-64 overflow-y-auto pr-1">
                      {AVATAR_PRESETS.map((preset, idx) => {
                        const isSelected = profile.avatar === preset.url;
                        return (
                          <button
                            key={idx}
                            onClick={() => handleSelectPreset(preset.url)}
                            className={`group relative aspect-square rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${
                              isSelected
                                ? 'border-lagoon ring-2 ring-lagoon/30 scale-100'
                                : 'border-ink/10 hover:border-lagoon/50 hover:scale-105'
                            }`}
                            title={preset.name}
                          >
                            <Image
                              src={preset.url}
                              alt={preset.name}
                              width={80}
                              height={80}
                              unoptimized
                              className="h-full w-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-lagoon/40 flex items-center justify-center">
                                <div className="h-5 w-5 rounded-full bg-white text-lagoon flex items-center justify-center shadow-sm">
                                  <Check className="h-3 w-3 stroke-[3]" />
                                </div>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* MODE 2: File Upload */}
                {avatarMode === 'upload' && (
                  <div className="space-y-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-ink/20 bg-mist p-6 text-center hover:border-lagoon hover:bg-mist-pure transition-all cursor-pointer"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lagoon/10 text-lagoon">
                        <Upload className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-ink">Click to upload photo</p>
                        <p className="text-[11px] text-ink-muted mt-1">PNG, JPG, or WebP up to 2 MB</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODE 3: Image URL */}
                {avatarMode === 'url' && (
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-ink">External Image URL</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={customAvatarUrl}
                        onChange={e => setCustomAvatarUrl(e.target.value)}
                        placeholder="https://example.com/avatar.jpg"
                        className="flex-1 rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2.5 text-xs text-ink outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/10 dark:bg-mist-subtle"
                      />
                      <button
                        onClick={handleApplyCustomUrl}
                        className="rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white hover:bg-lagoon transition-colors dark:bg-saffron dark:text-black cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                    <p className="text-[11px] text-ink-muted">
                      Use any public HTTPS link or image hosting service.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Identity & Personal Details */}
            <div className="lg:col-span-7 space-y-6">
              <div className="glass-panel rounded-3xl p-6 sm:p-7 border border-ink/8 shadow-sm space-y-5">
                <h2 className="font-display text-base font-bold text-ink border-b border-ink/8 pb-4">
                  Personal Details & Identity
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-ink">Full Legal / Display Name</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={e => updateField('name', e.target.value)}
                      placeholder="Your name"
                      className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2.5 text-xs text-ink outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/10 dark:bg-mist-subtle"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-ink">Sex / Identity</label>
                    <select
                      value={profile.sex}
                      onChange={e => updateField('sex', e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2.5 text-xs text-ink outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/10 dark:bg-mist-subtle"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Non-binary / Other</option>
                      <option value="prefer_not">Prefer not to say</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-ink">Professional Headline</label>
                  <input
                    type="text"
                    value={profile.headline || ''}
                    onChange={e => updateField('headline', e.target.value)}
                    placeholder="e.g. Senior Frontend Architect & Interaction Designer"
                    className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2.5 text-xs text-ink outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/10 dark:bg-mist-subtle"
                  />
                  <p className="text-[11px] text-ink-muted mt-1">
                    Summarize your core discipline and mentoring strengths.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-ink">About Me & Mentorship Style</label>
                    <span className="text-[10px] text-ink-muted">
                      {(profile.bio || '').length} / 500 characters
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    maxLength={500}
                    value={profile.bio || ''}
                    onChange={e => updateField('bio', e.target.value)}
                    placeholder="Tell other SkillSwap members about your journey, what topics you enjoy teaching, and what you are looking to learn..."
                    className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist-pure p-3.5 text-xs text-ink outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/10 dark:bg-mist-subtle leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-ink">City</label>
                    <input
                      type="text"
                      value={profile.city || ''}
                      onChange={e => updateField('city', e.target.value)}
                      placeholder="e.g. Bengaluru"
                      className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2.5 text-xs text-ink outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/10 dark:bg-mist-subtle"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-ink">Country Code</label>
                    <input
                      type="text"
                      value={profile.country || 'IN'}
                      onChange={e => updateField('country', e.target.value)}
                      placeholder="e.g. IN or US"
                      className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2.5 text-xs text-ink outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/10 dark:bg-mist-subtle"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-ink">Preferred Timezone</label>
                  <select
                    value={profile.timezone || 'Asia/Kolkata (IST +5:30)'}
                    onChange={e => updateField('timezone', e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2.5 text-xs text-ink outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/10 dark:bg-mist-subtle"
                  >
                    {TIMEZONE_OPTIONS.map((tz, i) => (
                      <option key={i} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Spoken Languages */}
                <div>
                  <label className="text-xs font-bold text-ink">Languages Spoken</label>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {COMMON_LANGUAGES.map(lang => {
                      const isSelected = (profile.languages || ['English']).includes(lang);
                      return (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => handleToggleLanguage(lang)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-lagoon text-white border border-lagoon'
                              : 'bg-mist-pure text-ink/70 border border-ink/10 hover:border-lagoon/50 dark:bg-mist-subtle'
                          }`}
                        >
                          {lang}
                        </button>
                      );
                    })}
                  </div>

                  {/* Add custom language */}
                  <div className="flex gap-2 mt-2.5">
                    <input
                      type="text"
                      value={newLanguage}
                      onChange={e => setNewLanguage(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomLanguage();
                        }
                      }}
                      placeholder="Add another language..."
                      className="max-w-xs rounded-xl border border-ink/15 bg-mist-pure px-3 py-1.5 text-xs text-ink outline-none focus:border-lagoon dark:bg-mist-subtle"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomLanguage}
                      className="rounded-xl bg-ink/10 px-3 py-1.5 text-xs font-bold text-ink hover:bg-ink/20 transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TEACHING & LEARNING SKILLS */}
        {activeTab === 'skills' && (
          <div className="space-y-8">
            {/* Teaching Preferences & Hourly Rate */}
            <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-ink/8 shadow-sm space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/8 pb-4">
                <div>
                  <h2 className="font-display text-base font-bold text-ink">
                    Teaching & Mentorship Setup
                  </h2>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Configure your hourly exchange rate and skills you offer to other members.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-ink">
                    <input
                      type="checkbox"
                      checked={profile.noTeach || false}
                      onChange={e => updateField('noTeach', e.target.checked)}
                      className="h-4 w-4 rounded border-ink/20 text-lagoon focus:ring-lagoon"
                    />
                    <span>Learn-only mode (Disable teaching)</span>
                  </label>
                </div>
              </div>

              {!profile.noTeach && (
                <>
                  {/* Rates and Experience */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="rounded-2xl bg-mist-pure/80 p-5 border border-ink/8">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-ink">Hourly Rate (SP)</label>
                        <span className="font-mono text-sm font-extrabold text-lagoon">
                          {profile.hourlyRate || 50} SP/hr
                        </span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="200"
                        step="5"
                        value={profile.hourlyRate || 50}
                        onChange={e => updateField('hourlyRate', Number(e.target.value))}
                        className="w-full accent-lagoon cursor-pointer"
                      />
                      <p className="text-[11px] text-ink-muted mt-2">
                        1 Skill Point (SP) = SP1 parity. Standard peer rate is 50 SP/hr.
                      </p>
                    </div>

                    <div className="rounded-2xl bg-mist-pure/80 p-5 border border-ink/8">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-ink">Years of Experience</label>
                        <span className="font-mono text-sm font-extrabold text-ink">
                          {profile.experienceYears || 3} Years
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={profile.experienceYears || 3}
                        onChange={e => updateField('experienceYears', Number(e.target.value))}
                        className="w-full accent-ink dark:accent-saffron cursor-pointer"
                      />
                      <p className="text-[11px] text-ink-muted mt-2">
                        Helps match you with learners seeking your proficiency level.
                      </p>
                    </div>

                    <div className="rounded-2xl bg-mist-pure/80 p-5 border border-ink/8 flex flex-col justify-between">
                      <div>
                        <label className="text-xs font-bold text-ink">Request Availability</label>
                        <p className="text-[11px] text-ink-muted mt-1">
                          Temporarily pause incoming session proposals.
                        </p>
                      </div>
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => updateField('isAcceptingRequests', profile.isAcceptingRequests === false ? true : false)}
                          className={`w-full rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                            profile.isAcceptingRequests !== false
                              ? 'bg-emerald-600 text-white'
                              : 'bg-ink/10 text-ink/70'
                          }`}
                        >
                          {profile.isAcceptingRequests !== false ? '✓ Accepting Swap Requests' : 'Paused (Unavailable)'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Teach Skills List */}
                  <div>
                    <label className="text-xs font-bold text-ink mb-2 block">
                      Skills You Teach ({profile.teach.length})
                    </label>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {profile.teach.map(skill => (
                        <span
                          key={skill}
                          className="flex items-center gap-1.5 rounded-full bg-lagoon/10 border border-lagoon/20 px-3.5 py-1 text-xs font-semibold text-lagoon"
                        >
                          <span>{skill}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTeachSkill(skill)}
                            className="rounded-full p-0.5 hover:bg-lagoon/20 transition-colors cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      {profile.teach.length === 0 && (
                        <p className="text-xs text-ink-muted italic">
                          No teaching skills added yet. Add at least one skill below!
                        </p>
                      )}
                    </div>

                    {/* Add Custom Teach Skill */}
                    <div className="flex gap-2 max-w-md">
                      <input
                        type="text"
                        value={newTeachSkill}
                        onChange={e => setNewTeachSkill(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTeachSkill(newTeachSkill);
                          }
                        }}
                        placeholder="Type a skill (e.g. Next.js, Figma, Python)..."
                        className="flex-1 rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2 text-xs text-ink outline-none focus:border-lagoon dark:bg-mist-subtle"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddTeachSkill(newTeachSkill)}
                        className="rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white hover:bg-lagoon transition-colors dark:bg-saffron dark:text-black cursor-pointer"
                      >
                        Add Skill
                      </button>
                    </div>

                    {/* Quick Suggestions */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      <span className="text-[11px] text-ink-muted">Suggested:</span>
                      {skillSuggestions.map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleAddTeachSkill(s)}
                          className="rounded-full bg-mist-pure px-2.5 py-0.5 text-[11px] font-medium text-ink/70 border border-ink/10 hover:border-lagoon hover:text-lagoon transition-colors cursor-pointer dark:bg-mist-subtle"
                        >
                          + {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Learning Skills */}
            <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-ink/8 shadow-sm space-y-6">
              <div className="border-b border-ink/8 pb-4">
                <h2 className="font-display text-base font-bold text-ink">
                  Skills You Want to Learn ({profile.learn.length})
                </h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  Our matching engine pairs you with verified peers offering these competencies.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {profile.learn.map(skill => (
                  <span
                    key={skill}
                    className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 px-3.5 py-1 text-xs font-semibold text-amber-700 dark:text-saffron"
                  >
                    <span>{skill}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveLearnSkill(skill)}
                      className="rounded-full p-0.5 hover:bg-amber-500/20 transition-colors cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add Custom Learn Skill */}
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={newLearnSkill}
                  onChange={e => setNewLearnSkill(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddLearnSkill(newLearnSkill);
                    }
                  }}
                  placeholder="What would you like to master next?..."
                  className="flex-1 rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2 text-xs text-ink outline-none focus:border-amber-500 dark:bg-mist-subtle"
                />
                <button
                  type="button"
                  onClick={() => handleAddLearnSkill(newLearnSkill)}
                  className="rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 transition-colors dark:bg-saffron dark:text-black cursor-pointer"
                >
                  Add Goal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: WEEKLY AVAILABILITY */}
        {activeTab === 'availability' && (
          <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-ink/8 shadow-sm space-y-6">
            <div className="border-b border-ink/8 pb-4">
              <h2 className="font-display text-base font-bold text-ink">
                Weekly Exchange Schedule
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Indicate when you are generally available for video mentoring sessions.
              </p>
            </div>

            <div className="space-y-4">
              {DAYS_OF_WEEK.map(day => {
                const activeDaySlots = currentAvailability[day.key] || [];
                return (
                  <div
                    key={day.key}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-mist-pure/60 p-4 border border-ink/8"
                  >
                    <div className="w-32">
                      <span className="text-xs font-bold text-ink">{day.label}</span>
                    </div>

                    <div className="flex flex-wrap gap-2 flex-1">
                      {TIME_SLOTS.map(slot => {
                        const isSelected = activeDaySlots.includes(slot.key);
                        return (
                          <button
                            key={slot.key}
                            type="button"
                            onClick={() => handleToggleAvailabilitySlot(day.key, slot.key)}
                            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-lagoon text-white shadow-xs'
                                : 'bg-mist text-ink/60 border border-ink/10 hover:border-lagoon/40'
                            }`}
                          >
                            {slot.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: SOCIAL & PORTFOLIO */}
        {activeTab === 'social' && (
          <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-ink/8 shadow-sm space-y-6">
            <div className="border-b border-ink/8 pb-4">
              <h2 className="font-display text-base font-bold text-ink">
                Social Profiles & Portfolios
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Linking your active engineering profiles increases swap acceptance rate by 40%.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-lagoon" />
                  <span>Personal Website / Portfolio URL</span>
                </label>
                <input
                  type="url"
                  value={profile.websiteUrl || ''}
                  onChange={e => updateField('websiteUrl', e.target.value)}
                  placeholder="https://yourname.dev"
                  className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2.5 text-xs text-ink outline-none focus:border-lagoon dark:bg-mist-subtle"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <span>GitHub Profile</span>
                </label>
                <input
                  type="url"
                  value={profile.githubUrl || ''}
                  onChange={e => updateField('githubUrl', e.target.value)}
                  placeholder="https://github.com/username"
                  className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2.5 text-xs text-ink outline-none focus:border-lagoon dark:bg-mist-subtle"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <span>LinkedIn Profile</span>
                </label>
                <input
                  type="url"
                  value={profile.linkedinUrl || ''}
                  onChange={e => updateField('linkedinUrl', e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                  className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2.5 text-xs text-ink outline-none focus:border-lagoon dark:bg-mist-subtle"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <span>Twitter / X Handle</span>
                </label>
                <input
                  type="text"
                  value={profile.twitterUrl || ''}
                  onChange={e => updateField('twitterUrl', e.target.value)}
                  placeholder="@yourhandle"
                  className="mt-1.5 w-full rounded-xl border border-ink/15 bg-mist-pure px-3.5 py-2.5 text-xs text-ink outline-none focus:border-lagoon dark:bg-mist-subtle"
                />
              </div>
            </div>
          </div>
        )}

        {/* Bottom Sticky Action Bar */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-ink/8 pt-6">
          <Link
            href="/dashboard"
            className="text-xs font-semibold text-ink/60 hover:text-ink transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Dashboard</span>
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                window.location.reload();
              }}
              className="rounded-xl border border-ink/15 px-4 py-2 text-xs font-bold text-ink/70 hover:bg-ink/5 transition-colors cursor-pointer"
            >
              Discard Changes
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-ink px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-lagoon active:scale-95 transition-all dark:bg-saffron dark:text-black dark:hover:bg-saffron-light cursor-pointer"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>{saving ? 'Saving...' : 'Save Profile'}</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
