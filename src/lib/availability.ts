export interface OverlappingSlot {
  start: string;
  end: string;
  durationMinutes: number;
}

export function buildAvailabilitySlot(startTime: string, endTime: string): string[] {
  const start = startTime?.trim() ?? '';
  const end = endTime?.trim() ?? '';

  if (!start || !end || end <= start) {
    return [];
  }

  return [`${start}-${end}`];
}

export function hasValidAvailabilityWindow(slots: string[] = []): boolean {
  return slots.some((slot) => {
    const [start, end] = slot.split('-');
    return Boolean(start && end && end > start);
  });
}

interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

interface UtcInterval {
  start: number;
  end: number;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

function getParts(date: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
}

function localDateTimeToUtc(local: LocalDateTime, timeZone: string): number[] {
  const target = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const offsets = new Set<number>();

  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const parts = getParts(new Date(target + hours * 60 * 60 * 1000), timeZone);
    const localAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute)
    );
    offsets.add(localAsUtc - (target + hours * 60 * 60 * 1000));
  }

  return [...offsets]
    .map((offset) => target - offset)
    .filter((timestamp) => {
      const parts = getParts(new Date(timestamp), timeZone);
      return Number(parts.year) === local.year &&
        Number(parts.month) === local.month &&
        Number(parts.day) === local.day &&
        Number(parts.hour) === local.hour &&
        Number(parts.minute) === local.minute;
    });
}

function localIntervals(
  availability: Record<string, string[]>,
  timeZone: string,
  now: Date
): UtcInterval[] {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayParts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value])
  );
  const today = Date.UTC(Number(todayParts.year), Number(todayParts.month) - 1, Number(todayParts.day));
  const intervals: UtcInterval[] = [];

  for (const [dayName, slots] of Object.entries(availability)) {
    const targetWeekday = WEEKDAYS[dayName.toLowerCase()];
    if (targetWeekday === undefined || !Array.isArray(slots)) continue;

    for (let offset = 0; offset < 15; offset += 1) {
      const occurrenceDate = new Date(today + offset * 24 * 60 * 60 * 1000);
      if (occurrenceDate.getUTCDay() !== targetWeekday) continue;

      for (const slot of slots) {
        const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(slot);
        if (!match) continue;
        const [, startHourText, startMinuteText, endHourText, endMinuteText] = match;
        const startHour = Number(startHourText);
        const startMinute = Number(startMinuteText);
        const endHour = Number(endHourText);
        const endMinute = Number(endMinuteText);
        if (
          startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59
        ) continue;

        const startLocal: LocalDateTime = {
          year: occurrenceDate.getUTCFullYear(),
          month: occurrenceDate.getUTCMonth() + 1,
          day: occurrenceDate.getUTCDate(),
          hour: startHour,
          minute: startMinute,
        };
        const endDate = new Date(occurrenceDate);
        if (endHour * 60 + endMinute <= startHour * 60 + startMinute) {
          endDate.setUTCDate(endDate.getUTCDate() + 1);
        }
        const endLocal: LocalDateTime = {
          year: endDate.getUTCFullYear(),
          month: endDate.getUTCMonth() + 1,
          day: endDate.getUTCDate(),
          hour: endHour,
          minute: endMinute,
        };

        for (const start of localDateTimeToUtc(startLocal, timeZone)) {
          for (const end of localDateTimeToUtc(endLocal, timeZone)) {
            if (end > start) intervals.push({ start, end });
          }
        }
      }
    }
  }

  return intervals.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function findOverlappingSlots(
  firstAvailability: Record<string, string[]>,
  firstTimeZone: string,
  secondAvailability: Record<string, string[]>,
  secondTimeZone: string,
  now = new Date()
): OverlappingSlot[] {
  try {
    const first = localIntervals(firstAvailability, firstTimeZone, now);
    const second = localIntervals(secondAvailability, secondTimeZone, now);
    const intersections: UtcInterval[] = [];

    for (const firstSlot of first) {
      for (const secondSlot of second) {
        const start = Math.max(firstSlot.start, secondSlot.start, now.getTime());
        const end = Math.min(firstSlot.end, secondSlot.end);
        if (end > start) intersections.push({ start, end });
      }
    }

    const merged: UtcInterval[] = [];
    for (const interval of intersections.sort((a, b) => a.start - b.start || a.end - b.end)) {
      const previous = merged.at(-1);
      if (previous && interval.start <= previous.end) {
        previous.end = Math.max(previous.end, interval.end);
      } else {
        merged.push({ ...interval });
      }
    }

    return merged.map(({ start, end }) => ({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      durationMinutes: Math.floor((end - start) / 60000),
    }));
  } catch {
    return [];
  }
}