/**
 * @fileoverview Rewrites Productive API timestamps into the reader's own time zone.
 * Productive returns datetimes at the organisation's offset (e.g. +02:00), which reads as a
 * wrong wall-clock time to anyone elsewhere. Every full ISO datetime in a response is
 * re-expressed in the display zone, still as ISO with its offset, so parsing it gives the
 * same instant. Date-only strings (e.g. "2026-09-29") are left alone.
 * @module utils/timezone
 */

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** Formats one ISO datetime in `timeZone`, e.g. "2026-09-29T15:14:31.795+10:00". */
export function toZonedIso(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map(p => [p.type, p.value])
  );

  const wallAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMin = Math.round((wallAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const ms = value.match(/\.(\d+)/) ? `.${pad(date.getUTCMilliseconds(), 3)}` : '';

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${ms}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Walks a parsed JSON value and rewrites every ISO datetime string into `timeZone`. */
export function localizeTimestamps<T>(value: T, timeZone: string): T {
  if (typeof value === 'string') {
    return (ISO_DATETIME.test(value) ? toZonedIso(value, timeZone) : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(v => localizeTimestamps(v, timeZone)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = localizeTimestamps(v, timeZone);
    return out as T;
  }
  return value;
}
