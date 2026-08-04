import { getKyivWeekBounds, kyivWallTimeToUtc } from './office-hours';

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
