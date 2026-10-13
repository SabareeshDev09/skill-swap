import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAvailabilitySlot, findOverlappingSlots, hasValidAvailabilityWindow } from '../src/lib/availability.ts';

const now = new Date('2026-10-09T12:00:00.000Z');

test('finds matching slots after normalizing different time zones to UTC', () => {
  const overlaps = findOverlappingSlots(
    { Mon: ['18:00-20:00'] },
    'America/New_York',
    { Monday: ['15:00-17:00'] },
    'America/Los_Angeles',
    now
  );

  assert.equal(overlaps.length, 2);
  assert.equal(overlaps[0].start, '2026-10-12T22:00:00.000Z');
  assert.equal(overlaps[0].end, '2026-10-13T00:00:00.000Z');
  assert.equal(overlaps[0].durationMinutes, 120);
});

test('matches intervals that cross a local weekday boundary', () => {
  const overlaps = findOverlappingSlots(
    { Tuesday: ['00:00-01:00'] },
    'UTC',
    { Monday: ['20:00-21:00'] },
    'America/New_York',
    now
  );

  assert.equal(overlaps[0]?.start, '2026-10-13T00:00:00.000Z');
  assert.equal(overlaps[0]?.durationMinutes, 60);
});

test('does not treat same weekday labels and clock times as overlapping across zones', () => {
  const overlaps = findOverlappingSlots(
    { Monday: ['18:00-20:00'] },
    'America/New_York',
    { Monday: ['18:00-20:00'] },
    'America/Los_Angeles',
    now
  );

  assert.deepEqual(overlaps, []);
});

test('ignores invalid availability time zones safely', () => {
  assert.deepEqual(
    findOverlappingSlots({ Mon: ['18:00-20:00'] }, 'Invalid/Zone', { Mon: ['18:00-20:00'] }, 'UTC', now),
    []
  );
});

test('keeps a partially entered availability window until both times are valid', () => {
  assert.deepEqual(buildAvailabilitySlot('18:00', ''), []);
  assert.deepEqual(buildAvailabilitySlot('', '20:00'), []);
  assert.deepEqual(buildAvailabilitySlot('18:00', '20:00'), ['18:00-20:00']);
  assert.equal(hasValidAvailabilityWindow(['18:00-20:00']), true);
  assert.equal(hasValidAvailabilityWindow(['20:00-18:00']), false);
});
