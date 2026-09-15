import { describe, it, expect, vi } from 'vitest';
import { extractMentionTokens, buildMentionReplacement, resolveMentions, renderStoredMentions } from '../mentions.js';
import { ProductivePerson } from '../../api/types.js';
import { ProductiveAPIClient } from '../../api/client.js';

function makePerson(id: string, firstName: string, lastName: string, avatarUrl?: string): ProductivePerson {
  return {
    id,
    type: 'people',
    attributes: {
      first_name: firstName,
      last_name: lastName,
      email: `${firstName.toLowerCase()}@example.com`,
      avatar_url: avatarUrl,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  };
}

function mockClient(people: ProductivePerson[]): ProductiveAPIClient {
  return {
    listPeople: vi.fn().mockResolvedValue({ data: people }),
  } as unknown as ProductiveAPIClient;
}

// --- extractMentionTokens ---

describe('extractMentionTokens', () => {
  it('returns empty array when no mentions', () => {
    expect(extractMentionTokens('Hello world')).toEqual([]);
  });

  it('returns empty for lowercase @words', () => {
    expect(extractMentionTokens('email me at @admin')).toEqual([]);
  });

  it('extracts a single full name mention', () => {
    const tokens = extractMentionTokens('Hey @Alex Morgan, check this');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].raw).toBe('@Alex Morgan');
    expect(tokens[0].name).toBe('Alex Morgan');
  });

  it('extracts a first-name-only mention', () => {
    const tokens = extractMentionTokens('Hey @Alex, check this');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].raw).toBe('@Alex');
    expect(tokens[0].name).toBe('Alex');
  });

  it('extracts multiple mentions', () => {
    const tokens = extractMentionTokens('@Jane Doe please review with @Bob Smith');
    expect(tokens).toHaveLength(2);
    expect(tokens[0].name).toBe('Jane Doe');
    expect(tokens[1].name).toBe('Bob Smith');
  });

  it('extracts mention at start of body', () => {
    const tokens = extractMentionTokens('@Jane hello');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].startIndex).toBe(0);
  });

  it('extracts mention at end of body', () => {
    const tokens = extractMentionTokens('hello @Jane');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].name).toBe('Jane');
  });

  it('extracts mention inside HTML', () => {
    const tokens = extractMentionTokens('<p>Hey @Alex Morgan</p>');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].name).toBe('Alex Morgan');
  });

  it('does not match already-resolved @[{...}] patterns', () => {
    const resolved = '@[{"type":"person","id":"123","label":"Alex Morgan"}]';
    const tokens = extractMentionTokens(resolved);
    expect(tokens).toHaveLength(0);
  });

  it('handles three-word names', () => {
    const tokens = extractMentionTokens('Hey @Mary Jane Watson');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].name).toBe('Mary Jane Watson');
  });

  it('tracks correct indices', () => {
    const body = 'Hey @Jane Doe!';
    const tokens = extractMentionTokens(body);
    expect(tokens[0].startIndex).toBe(4);
    expect(tokens[0].endIndex).toBe(13);
    expect(body.slice(tokens[0].startIndex, tokens[0].endIndex)).toBe('@Jane Doe');
  });
});

// --- buildMentionReplacement ---

describe('buildMentionReplacement', () => {
  it('builds correct JSON mention format', () => {
    const person = makePerson('300001', 'Alex', 'Morgan', 'https://example.com/avatar.png');
    const result = buildMentionReplacement(person);
    const parsed = JSON.parse(result.slice(2, -1)); // strip @[ and ]

    expect(parsed.type).toBe('person');
    expect(parsed.id).toBe('300001');
    expect(parsed.label).toBe('Alex Morgan');
    expect(parsed.avatar_url).toBe('https://example.com/avatar.png');
    expect(parsed.attachment_url).toBeNull();
    expect(parsed.is_done).toBe(false);
  });

  it('sets avatar_url to null when not provided', () => {
    const person = makePerson('123', 'Jane', 'Doe');
    const result = buildMentionReplacement(person);
    const parsed = JSON.parse(result.slice(2, -1));

    expect(parsed.avatar_url).toBeNull();
  });

  it('starts with @[ and ends with ]', () => {
    const person = makePerson('1', 'A', 'B');
    const result = buildMentionReplacement(person);

    expect(result.startsWith('@[')).toBe(true);
    expect(result.endsWith(']')).toBe(true);
  });
});

// --- resolveMentions ---

describe('resolveMentions', () => {
  it('returns body unchanged when no mentions', async () => {
    const client = mockClient([]);
    const result = await resolveMentions('Hello world', client);

    expect(result.resolvedBody).toBe('Hello world');
    expect(result.resolved).toHaveLength(0);
    expect(result.unresolved).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(0);
    // Should not call API when no mentions detected
    expect(client.listPeople).not.toHaveBeenCalled();
  });

  it('resolves a single exact full name match', async () => {
    const alex = makePerson('300001', 'Alex', 'Morgan');
    const client = mockClient([alex]);

    const result = await resolveMentions('Hey @Alex Morgan, check this', client);

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].person.id).toBe('300001');
    expect(result.unresolved).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(0);
    expect(result.resolvedBody).toContain('@[{');
    expect(result.resolvedBody).not.toContain('@Alex Morgan');
  });

  it('resolves a unique first-name-only match', async () => {
    const alex = makePerson('300001', 'Alex', 'Morgan');
    const client = mockClient([alex]);

    const result = await resolveMentions('Hey @Alex!', client);

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].person.id).toBe('300001');
  });

  it('marks first-name-only as ambiguous when multiple matches', async () => {
    const jane1 = makePerson('1', 'Jane', 'Doe');
    const jane2 = makePerson('2', 'Jane', 'Smith');
    const client = mockClient([jane1, jane2]);

    const result = await resolveMentions('Hey @Jane', client);

    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].candidates).toHaveLength(2);
    expect(result.resolved).toHaveLength(0);
    // Body should not be rewritten when ambiguous
    expect(result.resolvedBody).toBe('Hey @Jane');
  });

  it('marks unmatched mentions as unresolved', async () => {
    const alex = makePerson('300001', 'Alex', 'Morgan');
    const client = mockClient([alex]);

    const result = await resolveMentions('Hey @Nobody Special', client);

    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].name).toBe('Nobody Special');
    expect(result.resolved).toHaveLength(0);
    // Unresolved mentions left as plain text
    expect(result.resolvedBody).toContain('@Nobody Special');
  });

  it('resolves multiple mentions independently', async () => {
    const jane = makePerson('1', 'Jane', 'Doe');
    const bob = makePerson('2', 'Bob', 'Smith');
    const client = mockClient([jane, bob]);

    const result = await resolveMentions('@Jane Doe and @Bob Smith please review', client);

    expect(result.resolved).toHaveLength(2);
    expect(result.resolvedBody).not.toContain('@Jane Doe');
    expect(result.resolvedBody).not.toContain('@Bob Smith');
    expect(result.resolvedBody).toContain('please review');
  });

  it('handles mix of resolved and unresolved mentions', async () => {
    const alex = makePerson('300001', 'Alex', 'Morgan');
    const client = mockClient([alex]);

    const result = await resolveMentions('@Alex Morgan and @Unknown Person', client);

    expect(result.resolved).toHaveLength(1);
    expect(result.unresolved).toHaveLength(1);
    expect(result.resolvedBody).not.toContain('@Alex Morgan');
    expect(result.resolvedBody).toContain('@Unknown Person');
  });

  it('does not rewrite anything when ambiguous matches exist', async () => {
    const jane1 = makePerson('1', 'Jane', 'Doe');
    const jane2 = makePerson('2', 'Jane', 'Smith');
    const alex = makePerson('3', 'Alex', 'Morgan');
    const client = mockClient([jane1, jane2, alex]);

    const result = await resolveMentions('@Jane and @Alex Morgan', client);

    // Ambiguous @Jane prevents any rewriting
    expect(result.resolvedBody).toBe('@Jane and @Alex Morgan');
    expect(result.ambiguous).toHaveLength(1);
    expect(result.resolved).toHaveLength(0);
  });

  it('handles mention at start of body', async () => {
    const jane = makePerson('1', 'Jane', 'Doe');
    const client = mockClient([jane]);

    const result = await resolveMentions('@Jane Doe check this', client);

    expect(result.resolved).toHaveLength(1);
    expect(result.resolvedBody).toMatch(/^@\[/);
  });

  it('handles mention at end of body', async () => {
    const jane = makePerson('1', 'Jane', 'Doe');
    const client = mockClient([jane]);

    const result = await resolveMentions('check this @Jane Doe', client);

    expect(result.resolved).toHaveLength(1);
    expect(result.resolvedBody).toMatch(/\]$/);
  });

  it('handles mention inside HTML tags', async () => {
    const alex = makePerson('300001', 'Alex', 'Morgan');
    const client = mockClient([alex]);

    const result = await resolveMentions('<p>Hey @Alex Morgan</p>', client);

    expect(result.resolved).toHaveLength(1);
    expect(result.resolvedBody).toContain('<p>Hey ');
    expect(result.resolvedBody).toContain('</p>');
    expect(result.resolvedBody).not.toContain('@Alex Morgan');
  });

  it('matches names case-insensitively against people list', async () => {
    const alex = makePerson('300001', 'alex', 'morgan');
    const client = mockClient([alex]);

    // Regex captures "Alex Morgan" (capitalised), matching against lowercase person data
    const result = await resolveMentions('Hey @Alex Morgan', client);

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].person.id).toBe('300001');
  });
});

describe('renderStoredMentions', () => {
  it('renders a person blob as an @Label mention', () => {
    const body =
      '<p>@[{"type":"person","id":"300002","label":"Sam Taylor","avatar_url":null,"attachment_url":null,"is_done":false}] please review</p>';
    expect(renderStoredMentions(body)).toBe('<p>@Sam Taylor please review</p>');
  });

  it('renders an inline attachment blob as a pointer carrying the attachment ID', () => {
    const body =
      '<p>@[{"type":"inline_attachment","id":"5000001","label":"Screenshot.png","avatar_url":null,"attachment_url":"https://files.productive.io/x.png","is_done":false}]</p>';
    expect(renderStoredMentions(body)).toBe('<p>[attachment 5000001: Screenshot.png]</p>');
  });

  it('renders several blobs of mixed type in one body', () => {
    const body =
      '@[{"type":"person","label":"Pat M"}] see @[{"type":"inline_attachment","id":"12","label":"err.png"}]';
    expect(renderStoredMentions(body)).toBe('@Pat M see [attachment 12: err.png]');
  });

  it('leaves an unparseable blob verbatim', () => {
    const body = '@[{not valid json}]';
    expect(renderStoredMentions(body)).toBe('@[{not valid json}]');
  });

  it('returns an empty string for null and undefined', () => {
    expect(renderStoredMentions(null)).toBe('');
    expect(renderStoredMentions(undefined)).toBe('');
  });

  it('leaves text without blobs untouched', () => {
    expect(renderStoredMentions('plain body @NotAMention')).toBe('plain body @NotAMention');
  });
});
