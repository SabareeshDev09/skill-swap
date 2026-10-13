import type { Profile, PeerMatch, UserTeachSkill, UserLearnSkill } from '../types';
import { generateQuoteBreakdown } from './pricing';
import { findOverlappingSlots } from './availability';
import { normalizeSkillName } from './skills';

function matchesSkill(skillId: string, skillName: string, candidate: { skillId: string; skillName: string }): boolean {
  return skillId === candidate.skillId ||
    normalizeSkillName(skillName) === normalizeSkillName(candidate.skillName);
}

function shortestAllowedDuration(skills: UserTeachSkill[]): number {
  const durations = skills.flatMap((skill) => skill.allowedDurations)
    .filter((duration) => Number.isInteger(duration) && duration > 0);
  return durations.length > 0 ? Math.min(...durations) : 60;
}

export function computePeerMatches(learner: Profile, teachers: Profile[]): PeerMatch[] {
  const matches: PeerMatch[] = [];

  for (const teacher of teachers) {
    if (teacher.id === learner.id || !teacher.isAcceptingRequests || teacher.teachSkills.length === 0) {
      continue;
    }

    // 1. Language intersection check (Hard filter: >= 1 common language)
    const teacherLanguages = new Set(teacher.languages.map(normalizeSkillName));
    const commonLanguages = learner.languages.filter((language) =>
      teacherLanguages.has(normalizeSkillName(language))
    );
    if (commonLanguages.length === 0) {
      continue;
    }

    // 2. Forward fit: Does teacher offer a skill learner wants to learn?
    let matchedTeachSkill: UserTeachSkill | null = null;
    let matchedLearnSkill: UserLearnSkill | null = null;

    for (const wantToLearn of learner.learnSkills) {
      const offered = teacher.teachSkills.find((skill) => matchesSkill(wantToLearn.skillId, wantToLearn.skillName, skill));
      if (offered) {
        matchedTeachSkill = offered;
        matchedLearnSkill = wantToLearn;
        break;
      }
    }

    // Reverse fit allows a swap-only match when both users have complementary skills.
    let reverseLearnerCanTeach: UserTeachSkill | null = null;

    for (const teacherWants of teacher.learnSkills) {
      const learnerCan = learner.teachSkills.find((skill) => matchesSkill(teacherWants.skillId, teacherWants.skillName, skill));
      if (learnerCan) {
        reverseLearnerCanTeach = learnerCan;
        break;
      }
    }

    const isSwapMatch = reverseLearnerCanTeach !== null;
    if (!matchedTeachSkill && !isSwapMatch) continue;
    matchedTeachSkill ??= teacher.teachSkills[0];

    const allowedDuration = shortestAllowedDuration(
      reverseLearnerCanTeach ? [matchedTeachSkill, reverseLearnerCanTeach] : [matchedTeachSkill]
    );
    const overlappingSlots = findOverlappingSlots(
      learner.availability,
      learner.timezone,
      teacher.availability,
      teacher.timezone
    ).filter((slot) => slot.durationMinutes >= allowedDuration);
    if (overlappingSlots.length === 0) continue;

    // 5. Composite Score Calculation
    let score = 50; // base score
    const reasons: string[] = [];

    if (matchedLearnSkill) {
      score += 25;
      reasons.push(`Teaches ${matchedTeachSkill.skillName} (${matchedTeachSkill.level})`);
    }

    if (isSwapMatch && reverseLearnerCanTeach) {
      score += 20;
      reasons.push(`Mutual Swap: Wants to learn your ${reverseLearnerCanTeach.skillName}`);
    }

    if (overlappingSlots.length > 0) {
      score += 10;
      reasons.push(`Availability overlap for ${overlappingSlots[0].durationMinutes} minutes`);
    }

    if (teacher.reputationScore >= 4.9) {
      score += 5;
      reasons.push(`Highly rated (${teacher.reputationScore.toFixed(2)} ★ with ${teacher.completedSessionsCount} sessions)`);
    }

    if (commonLanguages.length > 0) {
      reasons.push(`Speaks ${commonLanguages.join(', ')}`);
    }

    score = Math.min(99, score);

    // 6. Pricing comparison
    const defaultDuration = Math.min(...matchedTeachSkill.allowedDurations);
    const directPrice = Math.round((matchedTeachSkill.hourlyRate * defaultDuration) / 60);

    let swapPriceTokens: number | undefined = undefined;
    let swapSavingsPct: number | undefined = undefined;

    if (isSwapMatch && reverseLearnerCanTeach) {
      const quote = generateQuoteBreakdown({
        type: 'SWAP',
        proposerLeg: {
          skillId: matchedTeachSkill.skillId,
          skillName: matchedTeachSkill.skillName,
          teacherId: teacher.id,
          learnerId: learner.id,
          hourlyRate: matchedTeachSkill.hourlyRate,
          durationMinutes: defaultDuration,
        },
        recipientLeg: {
          skillId: reverseLearnerCanTeach.skillId,
          skillName: reverseLearnerCanTeach.skillName,
          teacherId: learner.id,
          learnerId: teacher.id,
          hourlyRate: reverseLearnerCanTeach.hourlyRate,
          durationMinutes: defaultDuration,
        },
      });

      swapPriceTokens = quote.proposerLeg.chargedTokens;
      swapSavingsPct = quote.proposerSavingsPct;
    }

    matches.push({
      teacher,
      matchScore: score,
      isSwapMatch,
      reasons: reasons.slice(0, 3),
      directPriceTokens: directPrice,
      swapPriceTokens,
      swapSavingsPct,
      teacherOfferingSkill: matchedTeachSkill,
      matchingLearnSkill: matchedLearnSkill || undefined,
      teacherDesiresSkill: reverseLearnerCanTeach || undefined,
      overlappingSlots,
    });
  }

  // Sort: Swap matches first, then highest compatibility score
  return matches.sort((a, b) => {
    if (a.isSwapMatch && !b.isSwapMatch) return -1;
    if (!a.isSwapMatch && b.isSwapMatch) return 1;
    return b.matchScore - a.matchScore;
  });
}
