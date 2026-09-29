import { describe, it, expect } from 'vitest';
import { localizeTimestamps, toZonedIso } from '../timezone.js';

describe('toZonedIso', () => {
  it('re-expresses a Productive +02:00 time in Brisbane', () => {
    expect(toZonedIso('2026-09-29T07:14:31.795+02:00', 'Australia/Brisbane'))
      .toBe('2026-09-29T15:14:31.795+10:00');
  });

  it('keeps the same instant', () => {
    const src = '2026-09-29T07:14:31+02:00';
    const out = toZonedIso(src, 'Australia/Brisbane');
    expect(out).toBe('2026-09-29T15:14:31+10:00');
    expect(new Date(out).getTime()).toBe(new Date(src).getTime());
  });

  it('handles a zone with daylight saving', () => {
    expect(toZonedIso('2026-01-15T00:00:00Z', 'Australia/Sydney')).toBe('2026-01-15T11:00:00+11:00');
  });

  it('rolls the date over', () => {
    expect(toZonedIso('2026-09-29T20:30:00+02:00', 'Australia/Brisbane')).toBe('2026-09-30T04:30:00+10:00');
  });
});

describe('localizeTimestamps', () => {
  it('rewrites nested datetimes and leaves everything else', () => {
    const input = {
      data: [{ id: '1', attributes: { created_at: '2026-09-29T05:15:04.637+02:00', due_date: '2026-09-29', title: 'x', n: 3, ok: true, none: null } }],
    };
    expect(localizeTimestamps(input, 'Australia/Brisbane')).toEqual({
      data: [{ id: '1', attributes: { created_at: '2026-09-29T13:15:04.637+10:00', due_date: '2026-09-29', title: 'x', n: 3, ok: true, none: null } }],
    });
  });
});
