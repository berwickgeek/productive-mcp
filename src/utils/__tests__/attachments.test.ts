/**
 * @fileoverview Tests for the shared attachment formatter.
 * @module utils/__tests__/attachments.test
 */

import { describe, it, expect } from 'vitest';
import { formatAttachments } from '../attachments.js';
import { ProductiveIncludedResource } from '../../api/types.js';

const included: ProductiveIncludedResource[] = [
  {
    id: '8779248',
    type: 'attachments',
    attributes: {
      name: 'This_is_a_pdf_attachment.pdf',
      content_type: 'application/pdf',
      size: 16165,
      url: 'https://files.productive.io/attachments/files/008/779/248/original/This_is_a_pdf_attachment.pdf?1781846698',
    },
  },
];

describe('formatAttachments', () => {
  it('returns an empty string when there are no attachments', () => {
    expect(formatAttachments({}, included)).toBe('');
    expect(formatAttachments({ attachments: { data: [] } }, included)).toBe('');
    expect(formatAttachments(undefined, included)).toBe('');
  });

  it('renders id, name, content type and size from the included resource', () => {
    const rels = { attachments: { data: [{ id: '8779248', type: 'attachments' }] } };
    const out = formatAttachments(rels, included);

    expect(out).toContain('Attachments (1)');
    expect(out).toContain('ID 8779248');
    expect(out).toContain('This_is_a_pdf_attachment.pdf');
    expect(out).toContain('application/pdf');
    expect(out).toContain('16165 bytes');
  });

  it('never renders the download URL or a token', () => {
    const rels = { attachments: { data: [{ id: '8779248', type: 'attachments' }] } };
    const out = formatAttachments(rels, included);

    expect(out).not.toContain('files.productive.io');
    expect(out).not.toContain('token');
    expect(out).not.toContain('http');
  });

  it('falls back to the bare ID when the attachment is missing from included', () => {
    const rels = { attachments: { data: [{ id: '999', type: 'attachments' }] } };
    const out = formatAttachments(rels, included);

    expect(out).toContain('ID 999');
    expect(out).not.toContain('undefined');
  });

  it('applies the indent to each line', () => {
    const rels = { attachments: { data: [{ id: '8779248', type: 'attachments' }] } };
    const out = formatAttachments(rels, included, '  ');

    expect(out).toContain('\n  - ID 8779248');
  });
});
