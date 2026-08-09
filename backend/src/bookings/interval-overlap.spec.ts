import {
  hasOverlap,
  intervalsOverlap,
  type Interval,
} from './interval-overlap';

function interval(startIso: string, endIso: string): Interval {
  return { start: new Date(startIso), end: new Date(endIso) };
}

describe('intervalsOverlap', () => {
  it('does not flag back-to-back (adjacent) intervals as overlapping', () => {
    const first = interval('2026-08-04T10:00:00Z', '2026-08-04T11:00:00Z');
    const second = interval('2026-08-04T11:00:00Z', '2026-08-04T12:00:00Z');
    expect(intervalsOverlap(first, second)).toBe(false);
    expect(intervalsOverlap(second, first)).toBe(false);
  });

  it('flags a partial overlap', () => {
    const first = interval('2026-08-04T10:00:00Z', '2026-08-04T11:00:00Z');
    const second = interval('2026-08-04T10:30:00Z', '2026-08-04T11:30:00Z');
    expect(intervalsOverlap(first, second)).toBe(true);
    expect(intervalsOverlap(second, first)).toBe(true);
  });

  it('flags an exact match as overlapping', () => {
    const first = interval('2026-08-04T10:00:00Z', '2026-08-04T11:00:00Z');
    const second = interval('2026-08-04T10:00:00Z', '2026-08-04T11:00:00Z');
    expect(intervalsOverlap(first, second)).toBe(true);
  });

  it('flags one interval fully containing another as overlapping', () => {
    const outer = interval('2026-08-04T09:00:00Z', '2026-08-04T12:00:00Z');
    const inner = interval('2026-08-04T10:00:00Z', '2026-08-04T10:30:00Z');
    expect(intervalsOverlap(outer, inner)).toBe(true);
    expect(intervalsOverlap(inner, outer)).toBe(true);
  });

  it('does not flag intervals on different (adjacent) days as overlapping, even at matching times', () => {
    const monday = interval('2026-08-03T18:30:00Z', '2026-08-03T19:00:00Z');
    const tuesday = interval('2026-08-04T09:00:00Z', '2026-08-04T09:30:00Z');
    expect(intervalsOverlap(monday, tuesday)).toBe(false);
  });

  it('does not flag intervals with a genuine gap between them as overlapping', () => {
    const first = interval('2026-08-04T09:00:00Z', '2026-08-04T09:30:00Z');
    const second = interval('2026-08-04T10:00:00Z', '2026-08-04T10:30:00Z');
    expect(intervalsOverlap(first, second)).toBe(false);
  });
});

describe('hasOverlap', () => {
  it('returns false against an empty list', () => {
    const candidate = interval('2026-08-04T10:00:00Z', '2026-08-04T11:00:00Z');
    expect(hasOverlap(candidate, [])).toBe(false);
  });

  it('returns false when the candidate is only adjacent to existing bookings', () => {
    const candidate = interval('2026-08-04T11:00:00Z', '2026-08-04T12:00:00Z');
    const existing = [
      interval('2026-08-04T10:00:00Z', '2026-08-04T11:00:00Z'),
      interval('2026-08-04T12:00:00Z', '2026-08-04T13:00:00Z'),
    ];
    expect(hasOverlap(candidate, existing)).toBe(false);
  });

  it('returns true when the candidate overlaps any one existing booking', () => {
    const candidate = interval('2026-08-04T10:30:00Z', '2026-08-04T11:30:00Z');
    const existing = [
      interval('2026-08-04T09:00:00Z', '2026-08-04T09:30:00Z'),
      interval('2026-08-04T11:00:00Z', '2026-08-04T12:00:00Z'),
    ];
    expect(hasOverlap(candidate, existing)).toBe(true);
  });
});
