import { DateTime } from 'luxon';
import { OFFICE_TIMEZONE } from '../common/office-hours';

export interface WeeklyOccurrence {
  startAt: Date;
  endAt: Date;
}

/**
 * Weekly occurrences of a recurring booking, `occurrenceCount` weeks
 * apart at the same Kyiv wall-clock time as the first occurrence. Adding
 * calendar weeks in the Kyiv zone (rather than 7*24h in UTC) keeps the local
 * start/end hour stable across a DST transition that falls between occurrences.
 */
export function buildWeeklyOccurrences(
  firstStartAt: Date,
  firstEndAt: Date,
  occurrenceCount: number,
): WeeklyOccurrence[] {
  const startKyiv = DateTime.fromJSDate(firstStartAt, {
    zone: OFFICE_TIMEZONE,
  });
  const endKyiv = DateTime.fromJSDate(firstEndAt, { zone: OFFICE_TIMEZONE });

  return Array.from({ length: occurrenceCount }, (_, index) => ({
    startAt: startKyiv.plus({ weeks: index }).toUTC().toJSDate(),
    endAt: endKyiv.plus({ weeks: index }).toUTC().toJSDate(),
  }));
}
