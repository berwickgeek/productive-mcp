/**
 * @fileoverview Tests for the HTML to plain text converter.
 * @module utils/__tests__/html.test
 */

import { describe, it, expect } from 'vitest';
import { htmlToText } from '../html.js';

describe('htmlToText', () => {
  it('returns an empty string for null, undefined and empty input', () => {
    expect(htmlToText(null)).toBe('');
    expect(htmlToText(undefined)).toBe('');
    expect(htmlToText('')).toBe('');
  });

  it('converts paragraphs into blank-line separated blocks', () => {
    expect(htmlToText('<p>First para</p><p>Second para</p>')).toBe('First para\n\nSecond para');
  });

  it('converts list items into dashed bullets', () => {
    expect(htmlToText('<ul><li>one</li><li>two</li></ul>')).toBe('- one\n- two');
  });

  it('keeps link destinations alongside the label', () => {
    expect(htmlToText('<p>See <a href="https://example.com/x">the ticket</a>.</p>')).toBe(
      'See the ticket (https://example.com/x).'
    );
  });

  it('collapses a link whose label already is the URL', () => {
    expect(htmlToText('<a href="https://example.com">https://example.com</a>')).toBe(
      'https://example.com'
    );
  });

  it('marks inline images so their presence survives', () => {
    expect(htmlToText('<p>Before<img src="x.png">After</p>')).toBe('Before [inline image] After');
  });

  it('decodes named and numeric entities', () => {
    expect(htmlToText('<p>a &amp; b &lt;c&gt; &#39;d&#39; &nbsp;e</p>')).toBe("a & b <c> 'd' e");
  });

  it('turns br tags into single newlines', () => {
    expect(htmlToText('<p>line one<br>line two</p>')).toBe('line one\nline two');
  });

  it('strips script and style content entirely', () => {
    expect(htmlToText('<p>keep</p><script>alert(1)</script>')).toBe('keep');
  });

  it('does not truncate long bodies', () => {
    const long = 'x'.repeat(5000);
    expect(htmlToText(`<p>${long}</p>`)).toHaveLength(5000);
  });

  it('collapses runs of blank lines left by nested block tags', () => {
    expect(htmlToText('<div><p>a</p></div><div><p>b</p></div>')).toBe('a\n\nb');
  });
});
