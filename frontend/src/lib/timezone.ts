export const OFFICE_TIMEZONE = 'Europe/Kyiv';

export function getUserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Today's calendar date (YYYY-MM-DD) as observed in `timeZone`. */
export function getTodayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * IANA has more than one valid name for the same zone (e.g. the legacy
 * `Europe/Kiev` alias for `Europe/Kyiv`); comparing raw strings can call two
 * identical zones "different". Resolving both through Intl first normalizes them.
 */
export function isSameTimeZone(a: string, b: string): boolean {
  const resolve = (zone: string): string => new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  return resolve(a) === resolve(b);
}

const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = timeFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('uk-UA', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    timeFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Formats a UTC instant as "HH:MM" in the given IANA timezone. */
export function formatTimeInZone(isoUtc: string, timeZone: string): string {
  return getTimeFormatter(timeZone).format(new Date(isoUtc));
}

export function formatTimeRangeInZone(startIsoUtc: string, endIsoUtc: string, timeZone: string): string {
  return `${formatTimeInZone(startIsoUtc, timeZone)}–${formatTimeInZone(endIsoUtc, timeZone)}`;
}

/** Weekday + date label for a plain calendar date (YYYY-MM-DD), independent of any timezone conversion. */
export function formatDayHeader(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  return new Intl.DateTimeFormat('uk-UA', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Breaks a UTC instant into its calendar date + time-of-day components in the given timezone. */
export function getZonedDateParts(isoUtc: string, timeZone: string): ZonedDateParts {
  const parts = getPartsFormatter(timeZone).formatToParts(new Date(isoUtc));
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
  };
}

/** How far `timeZone`'s wall clock is ahead of UTC at the given instant, in milliseconds. */
function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour),
    Number(lookup.minute),
    Number(lookup.second),
  );
  return asUtc - date.getTime();
}

/**
 * Converts a wall-clock date + minutes-since-midnight in `timeZone` to the UTC
 * instant it represents (DST-aware). Used for grid label math and for turning
 * a user's local booking-form input into UTC -- the backend is the source of
 * truth for actual validation either way.
 */
export function zonedWallTimeToUtcIso(dateIso: string, minutesSinceMidnight: number, timeZone: string): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  const hour = Math.floor(minutesSinceMidnight / 60);
  const minute = minutesSinceMidnight % 60;
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMs = getTimeZoneOffsetMs(new Date(naiveUtcMs), timeZone);
  return new Date(naiveUtcMs - offsetMs).toISOString();
}

/** Kyiv-specific convenience wrapper around {@link zonedWallTimeToUtcIso}. */
export function kyivMinutesToUtcIso(dateIso: string, minutesSinceMidnight: number): string {
  return zonedWallTimeToUtcIso(dateIso, minutesSinceMidnight, OFFICE_TIMEZONE);
}
