import { describe, expect, it } from 'vitest';
import type { ScheduleBooking } from '../api/rooms';
import { addDays, getBookingPosition, getNowPosition, getSlotOffsetsMinutes, getWeekDates } from './schedule-grid';

function booking(overrides: Partial<ScheduleBooking> = {}): ScheduleBooking {
  return {
    id: 'booking-1',
    title: 'Синхронізація команди',
    startAt: '2026-08-10T07:00:00.000Z',
    endAt: '2026-08-10T08:00:00.000Z',
    userId: 'user-1',
    userName: 'Ганна Кузьменко',
    ...overrides,
  };
}

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-08-09', 1)).toBe('2026-08-10');
  });

  it('rolls over to the next month', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('rolls over to the next year', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('supports negative offsets', () => {
    expect(addDays('2026-08-09', -1)).toBe('2026-08-08');
  });
});

describe('getWeekDates', () => {
  it('returns 7 consecutive dates starting at weekStartDate', () => {
    expect(getWeekDates('2026-08-03')).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
    ]);
  });
});

describe('getSlotOffsetsMinutes', () => {
  it('produces one 30-minute offset per office-hours slot, from 0 to 570', () => {
    const offsets = getSlotOffsetsMinutes();
    expect(offsets[0]).toBe(0);
    expect(offsets.at(-1)).toBe(570);
    expect(offsets).toHaveLength(20);
  });
});

describe('getBookingPosition', () => {
  const weekDates = getWeekDates('2026-08-10');

  it('places a booking in the correct day column and row range (Kyiv office time)', () => {
    // 07:00-08:00 UTC = 10:00-11:00 Kyiv (EEST, UTC+3) in August.
    const position = getBookingPosition(booking(), weekDates);
    expect(position).toEqual({ dayIndex: 0, startRow: 2, endRow: 4 });
  });

  it('returns null for a booking whose Kyiv date falls outside the displayed week', () => {
    const position = getBookingPosition(
      booking({ startAt: '2026-09-01T07:00:00.000Z', endAt: '2026-09-01T08:00:00.000Z' }),
      weekDates,
    );
    expect(position).toBeNull();
  });
});

describe('getNowPosition', () => {
  const weekDates = getWeekDates('2026-08-10');

  it('returns a position when "now" is within office hours on a displayed day', () => {
    // 2026-08-10T07:00:00Z = 10:00 Kyiv.
    const position = getNowPosition(new Date('2026-08-10T07:00:00.000Z'), weekDates);
    expect(position).toEqual({ dayIndex: 0, row: 2 });
  });

  it('returns null when "now" is outside office hours', () => {
    // 2026-08-10T02:00:00Z = 05:00 Kyiv -- before the 09:00 open.
    const position = getNowPosition(new Date('2026-08-10T02:00:00.000Z'), weekDates);
    expect(position).toBeNull();
  });

  it('returns null when "now" falls on a day outside the displayed week', () => {
    const position = getNowPosition(new Date('2026-09-01T07:00:00.000Z'), weekDates);
    expect(position).toBeNull();
  });
});
