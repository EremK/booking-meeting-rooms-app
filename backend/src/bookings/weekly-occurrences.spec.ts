import { buildWeeklyOccurrences } from './weekly-occurrences';

describe('buildWeeklyOccurrences', () => {
  it('returns exactly occurrenceCount occurrences', () => {
    const occurrences = buildWeeklyOccurrences(
      new Date('2026-08-04T08:00:00.000Z'),
      new Date('2026-08-04T09:00:00.000Z'),
      5,
    );
    expect(occurrences).toHaveLength(5);
  });

  it('spaces each occurrence exactly 7 days apart outside DST transitions', () => {
    const occurrences = buildWeeklyOccurrences(
      new Date('2026-08-04T08:00:00.000Z'),
      new Date('2026-08-04T09:00:00.000Z'),
      3,
    );
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    expect(
      occurrences[1].startAt.getTime() - occurrences[0].startAt.getTime(),
    ).toBe(WEEK_MS);
    expect(
      occurrences[2].startAt.getTime() - occurrences[1].startAt.getTime(),
    ).toBe(WEEK_MS);
  });

  it('preserves the first occurrence unchanged', () => {
    const firstStartAt = new Date('2026-08-04T08:00:00.000Z');
    const firstEndAt = new Date('2026-08-04T09:00:00.000Z');
    const occurrences = buildWeeklyOccurrences(firstStartAt, firstEndAt, 4);
    expect(occurrences[0].startAt).toEqual(firstStartAt);
    expect(occurrences[0].endAt).toEqual(firstEndAt);
  });

  it('preserves the Kyiv wall-clock time across a DST transition', () => {
    // 2026-03-20 10:00 Kyiv (EET, UTC+2) -- the series crosses the 2026-03-29
    // spring-forward into EEST (UTC+3), so the UTC instant must jump an hour
    // while the Kyiv wall time stays 10:00-11:00.
    const occurrences = buildWeeklyOccurrences(
      new Date('2026-03-20T08:00:00.000Z'), // 10:00 Kyiv (UTC+2)
      new Date('2026-03-20T09:00:00.000Z'), // 11:00 Kyiv (UTC+2)
      3,
    );

    expect(occurrences[0].startAt.toISOString()).toBe(
      '2026-03-20T08:00:00.000Z',
    );
    expect(occurrences[1].startAt.toISOString()).toBe(
      '2026-03-27T08:00:00.000Z',
    );
    // After the DST jump the same 10:00 Kyiv wall time is 07:00 UTC, not 08:00.
    expect(occurrences[2].startAt.toISOString()).toBe(
      '2026-04-03T07:00:00.000Z',
    );
  });
});
