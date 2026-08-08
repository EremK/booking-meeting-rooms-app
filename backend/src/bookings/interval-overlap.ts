export interface Interval {
  start: Date;
  end: Date;
}

/**
 * Half-open [start, end) interval overlap check. Touching intervals -- one's
 * end exactly equals the other's start -- are NOT overlapping (e.g.
 * 10:00-11:00 and 11:00-12:00 are both valid, adjacent bookings).
 */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Whether `candidate` overlaps any interval in `existing`. */
export function hasOverlap(candidate: Interval, existing: Interval[]): boolean {
  return existing.some((interval) => intervalsOverlap(candidate, interval));
}
