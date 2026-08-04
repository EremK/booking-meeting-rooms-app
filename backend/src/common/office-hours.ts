import { DateTime } from 'luxon';

export const OFFICE_TIMEZONE = 'Europe/Kyiv';
export const OFFICE_OPEN_HOUR = 9;
export const OFFICE_CLOSE_HOUR = 19;

/**
 * Converts an office wall-clock time (Europe/Kyiv, DST-aware) to a UTC instant.
 * All booking times are stored in UTC; office-hours validation happens against
 * this same timezone, so this is the one place that conversion is defined.
 */
export function kyivWallTimeToUtc(wallTime: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}): Date {
  const dateTime = DateTime.fromObject(wallTime, { zone: OFFICE_TIMEZONE });
  if (!dateTime.isValid) {
    throw new Error(`Invalid Kyiv wall-clock time: ${dateTime.invalidReason}`);
  }
  return dateTime.toUTC().toJSDate();
}

export interface KyivWeekBounds {
  /** ISO date (YYYY-MM-DD) of the Monday that starts this week, in Kyiv time. */
  weekStartDate: string;
  /** Monday 00:00 Kyiv time, as a UTC instant. */
  weekStartUtc: Date;
  /** The following Monday 00:00 Kyiv time, as a UTC instant (exclusive upper bound). */
  weekEndUtc: Date;
}

/**
 * The Monday-to-Sunday Kyiv week containing `referenceDate` (defaults to today).
 * The grid's day/week boundaries are always anchored to office time (Kyiv) --
 * a user in another timezone sees the same underlying week, only relabeled.
 */
export function getKyivWeekBounds(referenceDate?: string): KyivWeekBounds {
  const reference = referenceDate
    ? DateTime.fromISO(referenceDate, { zone: OFFICE_TIMEZONE })
    : DateTime.now().setZone(OFFICE_TIMEZONE);
  if (!reference.isValid) {
    throw new Error(`Invalid reference date: ${reference.invalidReason}`);
  }

  const weekStart = reference.startOf('week');
  const weekEnd = weekStart.plus({ weeks: 1 });

  return {
    weekStartDate: weekStart.toISODate(),
    weekStartUtc: weekStart.toUTC().toJSDate(),
    weekEndUtc: weekEnd.toUTC().toJSDate(),
  };
}
