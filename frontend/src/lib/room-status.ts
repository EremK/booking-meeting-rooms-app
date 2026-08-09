import type { ScheduleBooking } from '../api/rooms';
import { OFFICE_CLOSE_HOUR, OFFICE_OPEN_HOUR } from './schedule-grid';
import { getDateInZone, getZonedDateParts, OFFICE_TIMEZONE } from './timezone';

interface TimelineBlock {
  startFraction: number;
  endFraction: number;
}

export interface RoomStatus {
  isAvailableNow: boolean;
  nextBooking: ScheduleBooking | null;
  /** Busy segments across the 09:00-19:00 office day, as fractions [0, 1]. */
  timeline: TimelineBlock[];
  /** Where "now" falls across the office day, as a fraction [0, 1], or null outside office hours. */
  nowFraction: number | null;
}

const OFFICE_DAY_MINUTES = (OFFICE_CLOSE_HOUR - OFFICE_OPEN_HOUR) * 60;

function officeMinutes(isoUtc: string): number {
  const parts = getZonedDateParts(isoUtc, OFFICE_TIMEZONE);
  return (parts.hour - OFFICE_OPEN_HOUR) * 60 + parts.minute;
}

/** Active bookings (the schedule API already excludes cancelled ones) whose Kyiv calendar date matches `now`. */
function getTodaysBookings(bookings: ScheduleBooking[], now: Date): ScheduleBooking[] {
  const today = getDateInZone(now.toISOString(), OFFICE_TIMEZONE);
  return bookings
    .filter((booking) => getDateInZone(booking.startAt, OFFICE_TIMEZONE) === today)
    .slice()
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** Derives a room's live status (available now / next booking / mini timeline) from its weekly schedule. */
export function getRoomStatus(bookings: ScheduleBooking[], now: Date = new Date()): RoomStatus {
  const todaysBookings = getTodaysBookings(bookings, now);
  const nowMinutes = officeMinutes(now.toISOString());
  const withinOfficeHours = nowMinutes >= 0 && nowMinutes < OFFICE_DAY_MINUTES;

  const isAvailableNow =
    !withinOfficeHours ||
    !todaysBookings.some(
      (booking) => officeMinutes(booking.startAt) <= nowMinutes && officeMinutes(booking.endAt) > nowMinutes,
    );

  const nextBooking = todaysBookings.find((booking) => officeMinutes(booking.endAt) > nowMinutes) ?? null;

  const timeline: TimelineBlock[] = todaysBookings.map((booking) => ({
    startFraction: Math.max(0, officeMinutes(booking.startAt)) / OFFICE_DAY_MINUTES,
    endFraction: Math.min(OFFICE_DAY_MINUTES, officeMinutes(booking.endAt)) / OFFICE_DAY_MINUTES,
  }));

  return {
    isAvailableNow,
    nextBooking,
    timeline,
    nowFraction: withinOfficeHours ? nowMinutes / OFFICE_DAY_MINUTES : null,
  };
}
