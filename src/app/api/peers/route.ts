import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { Profile, SkillLevel, UserLearnSkill, UserTeachSkill } from '@/types';

interface SkillTaxonomyJoin {
  id: string;
  name: string;
  category: string;
}

interface TeachSkillRow {
  skill_id: string;
  level: SkillLevel | null;
  years_experience: number | null;
  hourly_rate: number;
  allowed_durations: number[] | null;
  is_verified: boolean | null;
  skill_taxonomy: SkillTaxonomyJoin | null;
}

interface LearnSkillRow {
  skill_id: string;
  target_level: SkillLevel | null;
  goal: string | null;
  skill_taxonomy: SkillTaxonomyJoin | null;
}

interface PeerProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  languages: string[] | null;
  phone_verified: boolean | null;
  is_onboarded: boolean | null;
  is_accepting_requests: boolean | null;
  strikes_count: number | null;
  reputation_score: number | null;
  availability: unknown;
  user_skills_teach: TeachSkillRow[];
  user_skills_learn: LearnSkillRow[];
}

function readAvailability(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([day, slots]) =>
      Array.isArray(slots) && slots.every((slot): slot is string => typeof slot === 'string')
        ? [[day, slots]]
        : []
    )
  );
}

function toTeachSkill(row: TeachSkillRow): UserTeachSkill | null {
  if (!row.skill_taxonomy) return null;
  return {
    skillId: row.skill_id,
    skillName: row.skill_taxonomy.name,
    category: row.skill_taxonomy.category,
    level: row.level || 'intermediate',
    yearsExperience: Number(row.years_experience ?? 1),
    hourlyRate: row.hourly_rate,
    allowedDurations: row.allowed_durations || [],
    isVerified: row.is_verified === true,
  };
}

function toLearnSkill(row: LearnSkillRow): UserLearnSkill | null {
  if (!row.skill_taxonomy) return null;
  return {
    skillId: row.skill_id,
    skillName: row.skill_taxonomy.name,
    category: row.skill_taxonomy.category,
    targetLevel: row.target_level || 'intermediate',
    goal: row.goal || undefined,
  };
}

function toPeer(row: PeerProfileRow): Profile {
  const teachSkills = Array.isArray(row.user_skills_teach) ? row.user_skills_teach : [];
  const learnSkills = Array.isArray(row.user_skills_learn) ? row.user_skills_learn : [];

  return {
    id: row.id,
    email: row.email || '',
    fullName: row.full_name || 'SkillSwap member',
    avatarUrl: row.avatar_url || '/avatars/avatar_3.jpg',
    bio: row.bio || '',
    city: row.city || '',
    country: row.country || '',
    timezone: row.timezone || 'UTC',
    languages: Array.isArray(row.languages) ? row.languages : [],
    phoneVerified: row.phone_verified === true,
    isOnboarded: row.is_onboarded === true,
    isAcceptingRequests: row.is_accepting_requests === true,
    strikesCount: row.strikes_count || 0,
    reputationScore: Number(row.reputation_score ?? 0),
    completedSessionsCount: 0,
    availability: readAvailability(row.availability),
    teachSkills: teachSkills.map(toTeachSkill).filter((skill): skill is UserTeachSkill => skill !== null),
    learnSkills: learnSkills.map(toLearnSkill).filter((skill): skill is UserLearnSkill => skill !== null),
  };
}

export async function GET(request: NextRequest) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .select(`
        id, email, full_name, avatar_url, bio, city, country, timezone, languages,
        phone_verified, is_onboarded, is_accepting_requests, strikes_count,
        reputation_score, availability,
        user_skills_teach(skill_id, level, years_experience, hourly_rate, allowed_durations, is_verified,
          skill_taxonomy(id, name, category)),
        user_skills_learn(skill_id, target_level, goal,
          skill_taxonomy(id, name, category))
      `)
      .neq('id', user.id)
      .eq('is_onboarded', true)
      .eq('is_accepting_requests', true);

    if (error) {
      console.error('Peer lookup failed:', error);
      return NextResponse.json({ error: 'Unable to load peers' }, { status: 503 });
    }

    const peers = ((data || []) as unknown as PeerProfileRow[])
      .map(toPeer)
      .filter((peer) => peer.teachSkills.length > 0 || peer.learnSkills.length > 0);
    return NextResponse.json({ peers });
  } catch (error: unknown) {
    console.error('Peer lookup failed:', error);
    return NextResponse.json({ error: 'Unable to load peers' }, { status: 503 });
  }
}