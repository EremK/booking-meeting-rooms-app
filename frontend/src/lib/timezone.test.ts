import { describe, expect, it } from 'vitest';
import {
  formatTimeInZone,
  formatTimeRangeInZone,
  getDateInZone,
  getUserTimeZone,
  getZonedDateParts,
  isSameTimeZone,
  kyivMinutesToUtcIso,
  zonedWallTimeToUtcIso,
} from './timezone';

describe('formatTimeInZone', () => {
  it('matches the task example: 10:00 Kyiv shows as 09:00 for a Berlin user', () => {
    // 2026-08-10T07:00:00Z = 10:00 Kyiv (EEST, UTC+3) = 09:00 Berlin (CEST, UTC+2).
    const isoUtc = '2026-08-10T07:00:00.000Z';
    expect(formatTimeInZone(isoUtc, 'Europe/Kyiv')).toBe('10:00');
    expect(formatTimeInZone(isoUtc, 'Europe/Berlin')).toBe('09:00');
  });
});

describe('formatTimeRangeInZone', () => {
  it('formats both ends with an en dash', () => {
    expect(formatTimeRangeInZone('2026-08-10T07:00:00.000Z', '2026-08-10T08:00:00.000Z', 'Europe/Kyiv')).toBe(
      '10:00–11:00',
    );
  });
});

describe('getDateInZone', () => {
  it('rolls over to the next calendar date when the zone is ahead of UTC', () => {
    // 21:30 UTC + 3h (Kyiv, EEST) = 00:30 the next day.
    expect(getDateInZone('2026-08-10T21:30:00.000Z', 'Europe/Kyiv')).toBe('2026-08-11');
  });
});

describe('isSameTimeZone', () => {
  it('treats the legacy Europe/Kiev alias as the same zone as Europe/Kyiv', () => {
    expect(isSameTimeZone('Europe/Kyiv', 'Europe/Kiev')).toBe(true);
  });

  it('treats genuinely different zones as different', () => {
    expect(isSameTimeZone('Europe/Kyiv', 'Europe/Berlin')).toBe(false);
  });
});

describe('zonedWallTimeToUtcIso / kyivMinutesToUtcIso', () => {
  it('converts a Kyiv wall-clock time to the correct UTC instant', () => {
    // 10:00 = 600 minutes since midnight.
    expect(kyivMinutesToUtcIso('2026-08-10', 600)).toBe('2026-08-10T07:00:00.000Z');
    expect(zonedWallTimeToUtcIso('2026-08-10', 600, 'Europe/Kyiv')).toBe('2026-08-10T07:00:00.000Z');
  });

  it('accounts for the DST transition (EET before, EEST after the last Sunday of March)', () => {
    // Same 10:00 Kyiv wall-clock time, different UTC offset either side of the 2026 spring-forward.
    expect(kyivMinutesToUtcIso('2026-03-27', 600)).toBe('2026-03-27T08:00:00.000Z'); // EET, UTC+2
    expect(kyivMinutesToUtcIso('2026-03-30', 600)).toBe('2026-03-30T07:00:00.000Z'); // EEST, UTC+3
  });
});

describe('getZonedDateParts', () => {
  it('breaks a UTC instant into Kyiv calendar date + time-of-day parts', () => {
    expect(getZonedDateParts('2026-08-10T07:00:00.000Z', 'Europe/Kyiv')).toEqual({
      year: 2026,
      month: 8,
      day: 10,
      hour: 10,
      minute: 0,
    });
  });
});

describe('getUserTimeZone', () => {
  it('returns a non-empty IANA timezone string', () => {
    expect(getUserTimeZone().length).toBeGreaterThan(0);
  });
});
