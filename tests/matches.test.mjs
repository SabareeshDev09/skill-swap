import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { computePeerMatches } = await import('../src/lib/matches.ts');
const { uniqueSkillNames } = await import('../src/lib/skills.ts');

const allDayAvailability = Object.fromEntries(
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map((day) => [day, ['00:00-23:59']])
);

function skill(skillId, skillName, overrides = {}) {
  return {
    skillId,
    skillName,
    category: 'Technology',
    level: 'advanced',
    yearsExperience: 3,
    hourlyRate: 60,
    allowedDurations: [60],
    ...overrides,
  };
}

function profile(id, overrides = {}) {
  return {
    id,
    email: `${id}@example.com`,
    fullName: id,
    avatarUrl: '',
    bio: '',
    city: '',
    country: '',
    timezone: 'UTC',
    languages: ['English'],
    phoneVerified: false,
    isOnboarded: true,
    isAcceptingRequests: true,
    strikesCount: 0,
    reputationScore: 5,
    completedSessionsCount: 0,
    teachSkills: [],
    learnSkills: [],
    availability: allDayAvailability,
    ...overrides,
  };
}

test('keeps peers with a forward skill fit and a sufficient UTC overlap', () => {
  const learner = profile('learner', {
    learnSkills: [{ skillId: 'skill-js', skillName: 'JavaScript', category: 'Technology', targetLevel: 'beginner' }],
  });
  const teacher = profile('teacher', { teachSkills: [skill('skill-js', 'JavaScript')] });
  const matches = computePeerMatches(learner, [teacher]);

  assert.equal(matches.length, 1);
  assert.ok(matches[0].overlappingSlots.some((slot) => slot.durationMinutes >= 60));
});

test('matches skill names case-insensitively when taxonomy ids differ', () => {
  const learner = profile('learner', {
    learnSkills: [{ skillId: 'learner-skill-id', skillName: '  pYtHoN   Programming ', category: 'Technology', targetLevel: 'beginner' }],
  });
  const teacher = profile('teacher', {
    teachSkills: [skill('teacher-skill-id', 'Python Programming')],
  });

  assert.equal(computePeerMatches(learner, [teacher]).length, 1);
});

test('matches common languages without case differences', () => {
  const learner = profile('learner', {
    languages: ['english'],
    learnSkills: [{ skillId: 'learner-skill-id', skillName: 'Python', category: 'Technology', targetLevel: 'beginner' }],
  });
  const teacher = profile('teacher', {
    languages: ['English'],
    teachSkills: [skill('teacher-skill-id', 'PYTHON')],
  });

  assert.equal(computePeerMatches(learner, [teacher]).length, 1);
});

test('keeps peers with reverse swap fit even without forward fit', () => {
  const learner = profile('learner', { teachSkills: [skill('skill-python', 'Python')] });
  const teacher = profile('teacher', {
    teachSkills: [skill('skill-design', 'Design')],
    learnSkills: [{ skillId: 'skill-python', skillName: 'Python', category: 'Technology', targetLevel: 'beginner' }],
  });

  const matches = computePeerMatches(learner, [teacher]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].isSwapMatch, true);
  assert.equal(matches[0].matchingLearnSkill, undefined);
});

test('rejects exploratory matches without either skill fit', () => {
  const learner = profile('learner', {
    learnSkills: [{ skillId: 'skill-design', skillName: 'Design', category: 'Technology', targetLevel: 'beginner' }],
  });
  const teacher = profile('teacher', { teachSkills: [skill('skill-js', 'JavaScript')] });

  assert.deepEqual(computePeerMatches(learner, [teacher]), []);
});

test('allows swapping when one or both profiles are missing language metadata', () => {
  const learner = profile('learner', {
    languages: [],
    learnSkills: [{ skillId: 'skill-js', skillName: 'JavaScript', category: 'Technology', targetLevel: 'beginner' }],
  });
  const teacher = profile('teacher', {
    languages: [],
    teachSkills: [skill('skill-js', 'JavaScript')],
  });

  const matches = computePeerMatches(learner, [teacher]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].isSwapMatch, false);
});

test('rejects availability shorter than the shortest allowed session duration', () => {
  const learner = profile('learner', {
    learnSkills: [{ skillId: 'skill-js', skillName: 'JavaScript', category: 'Technology', targetLevel: 'beginner' }],
    availability: Object.fromEntries(
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        .map((day) => [day, ['00:00-00:30']])
    ),
  });
  const teacher = profile('teacher', { teachSkills: [skill('skill-js', 'JavaScript')] });

  assert.deepEqual(computePeerMatches(learner, [teacher]), []);
});

test('deduplicates skill names across case and whitespace variants', () => {
  assert.deepEqual(
    uniqueSkillNames(['Python', ' python ', 'PythOn   ', 'Figma']),
    ['Python', 'Figma']
  );
});