import { ProductiveAPIClient } from '../api/client.js';
import { ProductivePerson } from '../api/types.js';

/**
 * Matches @FirstName or @First Last (up to 3 capitalized words).
 * Won't match already-resolved @[{...}] patterns or @lowercase.
 */
const MENTION_REGEX = /@([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+){0,2})/g;

export interface MentionToken {
  raw: string;
  name: string;
  startIndex: number;
  endIndex: number;
}

export interface ResolvedMention {
  token: MentionToken;
  person: ProductivePerson;
  replacement: string;
}

export interface MentionResolutionResult {
  resolvedBody: string;
  resolved: ResolvedMention[];
  unresolved: MentionToken[];
  ambiguous: Array<{ token: MentionToken; candidates: ProductivePerson[] }>;
}

export function extractMentionTokens(body: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  MENTION_REGEX.lastIndex = 0;

  while ((match = MENTION_REGEX.exec(body)) !== null) {
    tokens.push({
      raw: match[0],
      name: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return tokens;
}

/**
 * Matches a stored mention blob, e.g. `@[{"type":"person","label":"Jay M",...}]`.
 * Kept deliberately tolerant so a malformed blob is left alone rather than mangled.
 */
const STORED_MENTION_REGEX = /@\[(\{[^\]]*\})\]/g;

/**
 * Render stored mention blobs back into readable text.
 *
 * Productive persists both people mentions and inline attachments as an inline
 * JSON object. That is machine-readable but wastes a lot of tokens and is
 * unreadable when a body is shown to a person, so collapse each blob:
 *
 * - `type: "person"` becomes `@Label`.
 * - `type: "inline_attachment"` becomes a pointer carrying the attachment ID,
 *   so a reader can see exactly where in the thread a screenshot sits and can
 *   fetch it with `get_attachment` without hunting for the ID.
 *
 * Blobs that fail to parse are left verbatim.
 *
 * @param body - Comment or description text that may contain mention blobs
 * @returns The same text with each blob rendered as readable text
 */
export function renderStoredMentions(body: string | null | undefined): string {
  if (!body) return '';

  return body.replace(STORED_MENTION_REGEX, (match, json: string) => {
    try {
      const parsed = JSON.parse(json) as { type?: string; id?: string; label?: string };
      if (!parsed.label) return match;

      if (parsed.type === 'inline_attachment') {
        return parsed.id
          ? `[attachment ${parsed.id}: ${parsed.label}]`
          : `[attachment: ${parsed.label}]`;
      }

      return `@${parsed.label}`;
    } catch {
      return match;
    }
  });
}

export function buildMentionReplacement(person: ProductivePerson): string {
  const mention = {
    type: 'person',
    id: person.id,
    label: `${person.attributes.first_name} ${person.attributes.last_name}`.trim(),
    avatar_url: person.attributes.avatar_url || null,
    attachment_url: null,
    is_done: false,
  };
  return `@[${JSON.stringify(mention)}]`;
}

function matchPerson(
  name: string,
  people: ProductivePerson[]
): ProductivePerson[] {
  const lowerName = name.toLowerCase();

  // Try exact full name match first
  const fullMatches = people.filter(p => {
    const fullName = `${p.attributes.first_name} ${p.attributes.last_name}`.trim().toLowerCase();
    return fullName === lowerName;
  });

  if (fullMatches.length > 0) return fullMatches;

  // Try first-name-only match for single-word tokens
  if (!name.includes(' ')) {
    return people.filter(p =>
      p.attributes.first_name.toLowerCase() === lowerName
    );
  }

  return [];
}

export async function resolveMentions(
  body: string,
  client: ProductiveAPIClient
): Promise<MentionResolutionResult> {
  const tokens = extractMentionTokens(body);

  if (tokens.length === 0) {
    return { resolvedBody: body, resolved: [], unresolved: [], ambiguous: [] };
  }

  // Fetch people for matching
  const response = await client.listPeople({ limit: 200 });
  const people = response.data || [];

  const resolved: ResolvedMention[] = [];
  const unresolved: MentionToken[] = [];
  const ambiguous: Array<{ token: MentionToken; candidates: ProductivePerson[] }> = [];

  for (const token of tokens) {
    const matches = matchPerson(token.name, people);

    if (matches.length === 1) {
      resolved.push({
        token,
        person: matches[0],
        replacement: buildMentionReplacement(matches[0]),
      });
    } else if (matches.length > 1) {
      ambiguous.push({ token, candidates: matches });
    } else {
      unresolved.push(token);
    }
  }

  // If there are ambiguous matches, don't rewrite anything
  if (ambiguous.length > 0) {
    return { resolvedBody: body, resolved: [], unresolved, ambiguous };
  }

  // Replace tokens in reverse order to preserve indices
  let resolvedBody = body;
  for (const r of [...resolved].reverse()) {
    resolvedBody =
      resolvedBody.slice(0, r.token.startIndex) +
      r.replacement +
      resolvedBody.slice(r.token.endIndex);
  }

  return { resolvedBody, resolved, unresolved, ambiguous };
}
