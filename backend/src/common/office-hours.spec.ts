import {
  getKyivDayBounds,
  getKyivWeekBounds,
  isOnHalfHourBoundary,
  isWithinOfficeHours,
  kyivWallTimeToUtc,
} from './office-hours';

describe('kyivWallTimeToUtc', () => {
  it('converts Kyiv summer time (EEST, UTC+3) to UTC', () => {
    const utc = kyivWallTimeToUtc({
      year: 2026,
      month: 8,
      day: 4,
      hour: 10,
      minute: 0,
    });
    expect(utc.toISOString()).toBe('2026-08-04T07:00:00.000Z');
  });

  it('converts Kyiv winter time (EET, UTC+2) to UTC', () => {
    const utc = kyivWallTimeToUtc({
      year: 2026,
      month: 1,
      day: 15,
      hour: 10,
      minute: 0,
    });
    expect(utc.toISOString()).toBe('2026-01-15T08:00:00.000Z');
  });
});

describe('getKyivWeekBounds', () => {
  it('resolves a mid-week date to that week’s Monday', () => {
    const bounds = getKyivWeekBounds('2026-08-06'); // a Thursday
    expect(bounds.weekStartDate).toBe('2026-08-03'); // the preceding Monday
  });

  it('resolves a Monday to itself', () => {
    const bounds = getKyivWeekBounds('2026-08-03');
    expect(bounds.weekStartDate).toBe('2026-08-03');
  });

  it('spans exactly 7 days from start to end', () => {
    const bounds = getKyivWeekBounds('2026-08-03');
    const spanMs = bounds.weekEndUtc.getTime() - bounds.weekStartUtc.getTime();
    expect(spanMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('anchors week start to Kyiv midnight, not UTC midnight', () => {
    const bounds = getKyivWeekBounds('2026-08-03');
    // Kyiv is UTC+3 in August, so 00:00 Kyiv Monday is 21:00 UTC Sunday.
    expect(bounds.weekStartUtc.toISOString()).toBe('2026-08-02T21:00:00.000Z');
  });
});

describe('getKyivDayBounds', () => {
  it('spans exactly 24 hours, anchored to Kyiv midnight', () => {
    const instant = kyivWallTimeToUtc({
      year: 2026,
      month: 8,
      day: 4,
      hour: 14,
      minute: 30,
    });
    const bounds = getKyivDayBounds(instant);
    expect(bounds.dayStartUtc.toISOString()).toBe('2026-08-03T21:00:00.000Z');
    expect(bounds.dayEndUtc.toISOString()).toBe('2026-08-04T21:00:00.000Z');
  });
});

describe('isOnHalfHourBoundary', () => {
  it('accepts times exactly on the hour or half-hour', () => {
    expect(
      isOnHalfHourBoundary(
        kyivWallTimeToUtc({ year: 2026, month: 8, day: 4, hour: 9, minute: 0 }),
      ),
    ).toBe(true);
    expect(
      isOnHalfHourBoundary(
        kyivWallTimeToUtc({
          year: 2026,
          month: 8,
          day: 4,
          hour: 9,
          minute: 30,
        }),
      ),
    ).toBe(true);
  });

  it('rejects times off the half-hour grid', () => {
    expect(
      isOnHalfHourBoundary(
        kyivWallTimeToUtc({
          year: 2026,
          month: 8,
          day: 4,
          hour: 9,
          minute: 15,
        }),
      ),
    ).toBe(false);
    expect(
      isOnHalfHourBoundary(
        kyivWallTimeToUtc({ year: 2026, month: 8, day: 4, hour: 9, minute: 1 }),
      ),
    ).toBe(false);
  });
});

describe('isWithinOfficeHours', () => {
  it('accepts a booking fully inside 09:00-19:00', () => {
    const start = kyivWallTimeToUtc({
      year: 2026,
      month: 8,
      day: 4,
      hour: 10,
      minute: 0,
    });
    const end = kyivWallTimeToUtc({
      year: 2026,
      month: 8,
      day: 4,
      hour: 11,
      minute: 0,
    });
    expect(isWithinOfficeHours(start, end)).toBe(true);
  });

  it('accepts a booking touching both office boundaries', () => {
    const start = kyivWallTimeToUtc({
      year: 2026,
      month: 8,
      day: 4,
      hour: 9,
      minute: 0,
    });
    const end = kyivWallTimeToUtc({
      year: 2026,
      month: 8,
      day: 4,
      hour: 19,
      minute: 0,
    });
    expect(isWithinOfficeHours(start, end)).toBe(true);
  });

  it('rejects a booking starting before office opens', () => {
    const start = kyivWallTimeToUtc({
      year: 2026,
      month: 8,
      day: 4,
      hour: 8,
      minute: 30,
    });
    const end = kyivWallTimeToUtc({
      year: 2026,
      month: 8,
      day: 4,
      hour: 9,
      minute: 30,
    });
    expect(isWithinOfficeHours(start, end)).toBe(false);
  });

  it('rejects a booking ending after office closes', () => {
    const start = kyivWallTimeToUtc({
      year: 2026,
      month: 8,
      day: 4,
      hour: 18,
      minute: 30,
    });
    const end = kyivWallTimeToUtc({
      year: 2026,
      month: 8,
      day: 4,
      hour: 19,
      minute: 30,
    });
    expect(isWithinOfficeHours(start, end)).toBe(false);
  });

  it('rejects a booking that spans midnight into a different Kyiv day', () => {
    const start = kyivWallTimeToUtc({
      year: 2026,
      month: 8,
      day: 4,
      hour: 23,
      minute: 0,
    });
    const end = kyivWallTimeToUtc({
      year: 2026,
      month: 8,
      day: 5,
      hour: 1,
      minute: 0,
    });
    expect(isWithinOfficeHours(start, end)).toBe(false);
  });
});
