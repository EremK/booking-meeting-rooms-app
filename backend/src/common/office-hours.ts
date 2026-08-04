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

export interface KyivDayBounds {
  dayStartUtc: Date;
  dayEndUtc: Date;
}

/** The single Kyiv calendar day containing `instant`, as UTC bounds (00:00 to the following 00:00). */
export function getKyivDayBounds(instant: Date): KyivDayBounds {
  const dayStart = DateTime.fromJSDate(instant, {
    zone: OFFICE_TIMEZONE,
  }).startOf('day');
  return {
    dayStartUtc: dayStart.toUTC().toJSDate(),
    dayEndUtc: dayStart.plus({ days: 1 }).toUTC().toJSDate(),
  };
}

/** Whether `instant` falls exactly on a 30-minute boundary in Kyiv time (BOOK-3). */
export function isOnHalfHourBoundary(instant: Date): boolean {
  const dateTime = DateTime.fromJSDate(instant, { zone: OFFICE_TIMEZONE });
  return (
    dateTime.minute % 30 === 0 &&
    dateTime.second === 0 &&
    dateTime.millisecond === 0
  );
}

/**
 * Whether [start, end) falls entirely within a single Kyiv office day and
 * within the 09:00-19:00 office-hours window (BOOK-5). Does not check
 * duration or slot alignment -- those are separate rules.
 */
export function isWithinOfficeHours(start: Date, end: Date): boolean {
  const startInKyiv = DateTime.fromJSDate(start, { zone: OFFICE_TIMEZONE });
  const endInKyiv = DateTime.fromJSDate(end, { zone: OFFICE_TIMEZONE });

  if (!startInKyiv.hasSame(endInKyiv, 'day')) {
    return false;
  }

  const startMinutesOfDay = startInKyiv.hour * 60 + startInKyiv.minute;
  const endMinutesOfDay = endInKyiv.hour * 60 + endInKyiv.minute;
  const officeOpenMinutes = OFFICE_OPEN_HOUR * 60;
  const officeCloseMinutes = OFFICE_CLOSE_HOUR * 60;

  return (
    startMinutesOfDay >= officeOpenMinutes &&
    endMinutesOfDay <= officeCloseMinutes
  );
}
