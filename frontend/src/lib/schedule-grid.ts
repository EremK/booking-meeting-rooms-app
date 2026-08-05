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

interface RowPosition {
  dayIndex: number;
  row: number;
}

/**
 * Where a single instant lands on the grid, in office-time (Kyiv) terms:
 * which day column, and which row (possibly fractional, possibly outside
 * [0, SLOT_COUNT] if the instant falls outside 09:00-19:00). Null if the
 * instant's Kyiv calendar date isn't one of the displayed week's columns.
 */
export function getRowForInstant(isoUtc: string, weekDates: string[]): RowPosition | null {
  const parts = getZonedDateParts(isoUtc, OFFICE_TIMEZONE);
  const dateIso = `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;

  const dayIndex = weekDates.indexOf(dateIso);
  if (dayIndex === -1) {
    return null;
  }

  const row = ((parts.hour - OFFICE_OPEN_HOUR) * 60 + parts.minute) / SLOT_MINUTES;
  return { dayIndex, row };
}

/**
 * Where a booking lands on the grid, in office-time (Kyiv) terms: which day
 * column, and which half-hour row range. Bookings never cross midnight
 * (max 4h, always within 09:00-19:00 office hours), so this is unambiguous.
 */
export function getBookingPosition(booking: ScheduleBooking, weekDates: string[]): BookingPosition | null {
  const start = getRowForInstant(booking.startAt, weekDates);
  const end = getRowForInstant(booking.endAt, weekDates);
  if (!start || !end) {
    return null;
  }
  return { dayIndex: start.dayIndex, startRow: start.row, endRow: end.row };
}

/** The current-time indicator's position, or null if "now" isn't visible on this week/within office hours. */
export function getNowPosition(now: Date, weekDates: string[]): RowPosition | null {
  const position = getRowForInstant(now.toISOString(), weekDates);
  if (!position || position.row < 0 || position.row > SLOT_COUNT) {
    return null;
  }
  return position;
}
