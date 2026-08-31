/**
 * Date and number formatting pinned to one locale and time zone.
 *
 * Server components render in the host's locale and UTC; the browser renders in
 * the viewer's. Passing `undefined` as the locale therefore produces different
 * strings on the two sides and React reports a hydration mismatch.
 *
 * Pinning also happens to be the correct product behaviour: this is a network
 * for one college, so a session at 18:00 should read 18:00 for everybody rather
 * than shifting with the reader's device.
 */

const LOCALE = 'en-GB';
const TIME_ZONE = 'Asia/Kolkata';

type Input = string | number | Date;

const toDate = (value: Input) => (value instanceof Date ? value : new Date(value));

/** 1 Sept 2026 */
export function formatDate(value: Input): string {
  return toDate(value).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TIME_ZONE,
  });
}

/** 1 Sept — for dense tables and axes where the year is obvious. */
export function formatDayMonth(value: Input): string {
  return toDate(value).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    timeZone: TIME_ZONE,
  });
}

/** Mon 1 Sept, 18:00 */
export function formatDateTime(value: Input): string {
  return toDate(value).toLocaleString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  });
}

/** 1 Sept 2026, 18:00 — for audit trails where the year matters. */
export function formatFullDateTime(value: Input): string {
  return toDate(value).toLocaleString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  });
}

/** 18:00 */
export function formatTime(value: Input): string {
  return toDate(value).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  });
}

/** September 2026 */
export function formatMonthYear(value: Input): string {
  return toDate(value).toLocaleDateString(LOCALE, {
    month: 'long',
    year: 'numeric',
    timeZone: TIME_ZONE,
  });
}

/** Sept 2026 */
export function formatShortMonthYear(value: Input): string {
  return toDate(value).toLocaleDateString(LOCALE, {
    month: 'short',
    year: 'numeric',
    timeZone: TIME_ZONE,
  });
}

/** 1 Sept 26 — for the densest table columns. */
export function formatCompactDate(value: Input): string {
  return toDate(value).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    timeZone: TIME_ZONE,
  });
}

/** Today / Yesterday / 1 Sept 2026 — for chat day separators. */
export function formatRelativeDay(value: Input): string {
  const d = toDate(value);
  const key = (x: Date) => x.toLocaleDateString(LOCALE, { timeZone: TIME_ZONE });
  const now = new Date();
  if (key(d) === key(now)) return 'Today';
  if (key(d) === key(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  return formatDate(d);
}

/** Thousands separators, pinned for the same reason. */
export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE);
}
