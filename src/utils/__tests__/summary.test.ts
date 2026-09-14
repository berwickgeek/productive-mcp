/**
 * @fileoverview Tests the list-view body summariser.
 * @module utils/__tests__/summary.test
 */

import { describe, it, expect } from 'vitest';
import { summariseBody, LIST_BODY_CHARS } from '../summary.js';

describe('summariseBody', () => {
  it('returns an empty string for an absent body', () => {
    expect(summariseBody(undefined)).toBe('');
    expect(summariseBody(null)).toBe('');
    expect(summariseBody('')).toBe('');
  });

  it('strips HTML rather than truncating through a tag', () => {
    expect(summariseBody('<p>Hello <strong>there</strong></p>')).toBe('Hello there');
  });

  it('collapses the newlines a multi-line body would otherwise print', () => {
    expect(summariseBody('<p>One</p><p>Two</p>')).toBe('One Two');
  });

  it('keeps a short body whole', () => {
    expect(summariseBody('<p>Short</p>')).toBe('Short');
  });

  it('truncates a long body and says how much was dropped', () => {
    const result = summariseBody(`<p>${'x'.repeat(5000)}</p>`);
    expect(result.length).toBeLessThan(220);
    expect(result).toContain('[truncated, 5000 chars total]');
    expect(result.startsWith('x'.repeat(LIST_BODY_CHARS))).toBe(true);
  });

  it('honours an explicit budget', () => {
    expect(summariseBody('<p>abcdefghij</p>', 4)).toBe('abcd... [truncated, 10 chars total]');
  });
});
