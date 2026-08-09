import { describe, expect, it } from 'vitest';
import type { ScheduleBooking } from '../api/rooms';
import { getRoomStatus } from './room-status';

function booking(startAt: string, endAt: string, overrides: Partial<ScheduleBooking> = {}): ScheduleBooking {
  return {
    id: `${startAt}-${endAt}`,
    title: 'Синхронізація команди',
    startAt,
    endAt,
    userId: 'user-1',
    userName: 'Ганна Кузьменко',
    ...overrides,
  };
}

describe('getRoomStatus', () => {
  it('is available now when no booking covers the current moment', () => {
    const bookings = [booking('2026-08-10T07:00:00.000Z', '2026-08-10T08:00:00.000Z')]; // 10:00-11:00 Kyiv
    const now = new Date('2026-08-10T05:00:00.000Z'); // 08:00 Kyiv, before the booking
    const status = getRoomStatus(bookings, now);
    expect(status.isAvailableNow).toBe(true);
  });

  it('is busy now when a booking covers the current moment', () => {
    const bookings = [booking('2026-08-10T07:00:00.000Z', '2026-08-10T08:00:00.000Z')]; // 10:00-11:00 Kyiv
    const now = new Date('2026-08-10T07:30:00.000Z'); // 10:30 Kyiv, inside the booking
    const status = getRoomStatus(bookings, now);
    expect(status.isAvailableNow).toBe(false);
  });

  it('is available outside office hours even with a same-day booking', () => {
    const bookings = [booking('2026-08-10T07:00:00.000Z', '2026-08-10T08:00:00.000Z')];
    const now = new Date('2026-08-10T18:00:00.000Z'); // 21:00 Kyiv, after the 19:00 close
    const status = getRoomStatus(bookings, now);
    expect(status.isAvailableNow).toBe(true);
    expect(status.nowFraction).toBeNull();
  });

  it('reports the next upcoming booking today, ignoring ones already ended', () => {
    const bookings = [
      booking('2026-08-10T05:00:00.000Z', '2026-08-10T06:00:00.000Z'), // 08:00-09:00 Kyiv, already over
      booking('2026-08-10T09:00:00.000Z', '2026-08-10T10:00:00.000Z'), // 12:00-13:00 Kyiv, upcoming
    ];
    const now = new Date('2026-08-10T07:00:00.000Z'); // 10:00 Kyiv
    const status = getRoomStatus(bookings, now);
    expect(status.nextBooking?.startAt).toBe('2026-08-10T09:00:00.000Z');
  });

  it('ignores bookings on other calendar days', () => {
    const bookings = [booking('2026-08-11T07:00:00.000Z', '2026-08-11T08:00:00.000Z')];
    const now = new Date('2026-08-10T07:00:00.000Z');
    const status = getRoomStatus(bookings, now);
    expect(status.isAvailableNow).toBe(true);
    expect(status.timeline).toHaveLength(0);
    expect(status.nextBooking).toBeNull();
  });

  it('builds a timeline block spanning the correct fraction of the office day', () => {
    // 09:00-19:00 office day = 600 minutes. A 10:00-11:00 Kyiv booking starts 60min in, lasts 60min.
    const bookings = [booking('2026-08-10T07:00:00.000Z', '2026-08-10T08:00:00.000Z')];
    const status = getRoomStatus(bookings, new Date('2026-08-10T05:00:00.000Z'));
    expect(status.timeline).toEqual([{ startFraction: 60 / 600, endFraction: 120 / 600 }]);
  });
});
