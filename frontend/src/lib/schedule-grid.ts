import { getZonedDateParts, OFFICE_TIMEZONE } from './timezone';
import type { ScheduleBooking } from '../api/rooms';

export const OFFICE_OPEN_HOUR = 9;
export const OFFICE_CLOSE_HOUR = 19;
export const SLOT_MINUTES = 30;
export const SLOT_COUNT = ((OFFICE_CLOSE_HOUR - OFFICE_OPEN_HOUR) * 60) / SLOT_MINUTES;

/** YYYY-MM-DD + days, treated as a plain calendar date (no timezone involved). */
export function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The 7 calendar dates (Mon..Sun) of the week starting at weekStartDate. */
export function getWeekDates(weekStartDate: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index));
}

/** Minutes-after-office-open for the start of each 30-minute row, e.g. [0, 30, ..., 570]. */
export function getSlotOffsetsMinutes(): number[] {
  return Array.from({ length: SLOT_COUNT }, (_, index) => index * SLOT_MINUTES);
}

export interface BookingPosition {
  dayIndex: number;
  startRow: number;
  endRow: number;
}

/**
 * Where a booking lands on the grid, in office-time (Kyiv) terms: which day
 * column, and which half-hour row range. Bookings never cross midnight
 * (max 4h, always within 09:00-19:00 office hours), so this is unambiguous.
 */
export function getBookingPosition(booking: ScheduleBooking, weekDates: string[]): BookingPosition | null {
  const start = getZonedDateParts(booking.startAt, OFFICE_TIMEZONE);
  const end = getZonedDateParts(booking.endAt, OFFICE_TIMEZONE);
  const dateIso = `${start.year.toString().padStart(4, '0')}-${start.month.toString().padStart(2, '0')}-${start.day.toString().padStart(2, '0')}`;

  const dayIndex = weekDates.indexOf(dateIso);
  if (dayIndex === -1) {
    return null;
  }

  const startRow = ((start.hour - OFFICE_OPEN_HOUR) * 60 + start.minute) / SLOT_MINUTES;
  const endRow = ((end.hour - OFFICE_OPEN_HOUR) * 60 + end.minute) / SLOT_MINUTES;
  return { dayIndex, startRow, endRow };
}
