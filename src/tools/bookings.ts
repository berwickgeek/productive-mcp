import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

type ToolResult = { content: Array<{ type: string; text: string }> };

// ─── Generic list_bookings tool (from PR) ────────────────────────────────────

const listBookingsSchema = z.object({
  person_id: z.string().optional(),
  project_id: z.string().optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
  page: z.number().min(1).optional(),
});

function handleError(error: unknown): never {
  if (error instanceof z.ZodError) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
  }
  throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
}

function formatMinutes(minutes: number | undefined): string {
  if (minutes === undefined) return 'N/A';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export async function listBookingsTool(
  client: ProductiveAPIClient,
  args: unknown,
  config?: { PRODUCTIVE_USER_ID?: string }
): Promise<ToolResult> {
  try {
    const params = listBookingsSchema.parse(args || {});

    let personId = params.person_id;
    if (personId === 'me') {
      if (!config?.PRODUCTIVE_USER_ID) {
        throw new McpError(ErrorCode.InvalidParams, 'Cannot use "me" reference - PRODUCTIVE_USER_ID is not configured');
      }
      personId = config.PRODUCTIVE_USER_ID;
    }

    const response = await client.listBookingsTyped({
      person_id: personId,
      project_id: params.project_id,
      after: params.after,
      before: params.before,
      limit: params.limit,
      page: params.page,
    });

    if (!response.data || response.data.length === 0) {
      return { content: [{ type: 'text', text: 'No bookings found matching the criteria.' }] };
    }

    const bookingsText = response.data.map(booking => {
      const bookingPersonId = booking.relationships?.person?.data?.id;
      const bookingProjectId = booking.relationships?.project?.data?.id;
      const timePerDay = formatMinutes(booking.attributes.time as number | undefined);
      const totalBooked = formatMinutes(booking.attributes.booked_time as number | undefined);
      return `• Booking (ID: ${booking.id})
  Period: ${booking.attributes.started_on} → ${booking.attributes.ended_on}
  Time per day: ${timePerDay}
  ${booking.attributes.booked_time !== undefined ? `Total booked: ${totalBooked}` : ''}
  ${booking.attributes.note ? `Note: ${booking.attributes.note}` : ''}
  ${bookingPersonId ? `Person ID: ${bookingPersonId}` : ''}
  ${bookingProjectId ? `Project ID: ${bookingProjectId}` : ''}`.trim();
    }).join('\n\n');

    const total = response.meta?.total_count;
    const summary = `Found ${response.data.length} booking${response.data.length !== 1 ? 's' : ''}${total ? ` (showing ${response.data.length} of ${total})` : ''}:\n\n${bookingsText}`;

    return { content: [{ type: 'text', text: summary }] };
  } catch (error) {
    handleError(error);
  }
}

export const listBookingsDefinition = {
  name: 'list_bookings',
  description: 'List resource bookings/capacity planning entries in Productive.io. Bookings show planned work allocation for people on projects over date ranges. Use to check availability and planned capacity. Use "me" for person_id if PRODUCTIVE_USER_ID is configured.',
  inputSchema: {
    type: 'object',
    properties: {
      person_id: { type: 'string', description: 'Filter by person ID. Use "me" for the configured user.' },
      project_id: { type: 'string', description: 'Filter by project ID' },
      after: { type: 'string', description: 'Filter bookings starting after this date (YYYY-MM-DD)' },
      before: { type: 'string', description: 'Filter bookings starting before this date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Number of results (1-200, default: 30)', minimum: 1, maximum: 200, default: 30 },
      page: { type: 'number', description: 'Page number for pagination', minimum: 1 },
    },
  },
};

// ─── rb2 Resource Planning tools ─────────────────────────────────────────────

const getResourcePlanSchema = z.object({
  after: z.string().optional().describe('Start date YYYY-MM-DD (default: today)'),
  before: z.string().optional().describe('End date YYYY-MM-DD (default: +4 weeks)'),
  person_name: z.string().optional().describe('Filter by person name (partial match, case-insensitive)'),
  project_name: z.string().optional().describe('Filter by project name (partial match, case-insensitive)'),
});

const getOverbookedSchema = z.object({
  after: z.string().optional().describe('Start date YYYY-MM-DD (default: today)'),
  before: z.string().optional().describe('End date YYYY-MM-DD (default: +4 weeks)'),
  threshold_pct: z.number().min(1).max(200).default(100).optional().describe('Overbooking threshold % of 8h day (default: 100)'),
});

export const getResourcePlanTool = {
  name: 'get_resource_plan',
  description: 'Get the rb2 resource plan — who is booked on what project, hours/day and utilisation for the next 4 weeks (or custom range). Use to check capacity before adding work or to see who has availability.',
  inputSchema: {
    type: 'object',
    properties: {
      after: { type: 'string', description: 'Start date YYYY-MM-DD (default: today)' },
      before: { type: 'string', description: 'End date YYYY-MM-DD (default: +4 weeks)' },
      person_name: { type: 'string', description: 'Filter by person name (partial, case-insensitive)' },
      project_name: { type: 'string', description: 'Filter by project name (partial, case-insensitive)' },
    },
  },
};

export const getOverbookedPeopleTool = {
  name: 'get_overbooked_people',
  description: 'Detect rb2 team members who are overbooked — multiple bookings in overlapping periods exceeding a capacity threshold. Returns each overbooked person with total hours/day and conflicting bookings.',
  inputSchema: {
    type: 'object',
    properties: {
      after: { type: 'string', description: 'Start date YYYY-MM-DD (default: today)' },
      before: { type: 'string', description: 'End date YYYY-MM-DD (default: +4 weeks)' },
      threshold_pct: { type: 'number', description: 'Overbooking threshold % of 8h day (default: 100)', default: 100 },
    },
  },
};

function defaultDateRange(): { after: string; before: string } {
  const today = new Date();
  const fourWeeks = new Date(today);
  fourWeeks.setDate(today.getDate() + 28);
  return {
    after: today.toISOString().split('T')[0],
    before: fourWeeks.toISOString().split('T')[0],
  };
}

/** Build a lookup map from the `included` array returned alongside paginated bookings */
function buildIncludedMap(included: any[]): Record<string, any> {
  const map: Record<string, any> = {};
  for (const item of included ?? []) {
    map[`${item.type}:${item.id}`] = item;
  }
  return map;
}

/** Resolve project name from booking via service → deal → project chain */
function resolveProjectName(booking: any, map: Record<string, any>): string {
  const serviceId = booking.relationships?.service?.data?.id;
  if (!serviceId) return '?';
  const service = map[`services:${serviceId}`];
  const dealId = service?.relationships?.deal?.data?.id;
  if (!dealId) return service?.attributes?.name ?? '?';
  const deal = map[`deals:${dealId}`];
  const projectId = deal?.relationships?.project?.data?.id;
  if (!projectId) return deal?.attributes?.name ?? '?';
  const project = map[`projects:${projectId}`];
  return project?.attributes?.name ?? `Project ${projectId}`;
}

/** Resolve person full name from booking */
function resolvePersonName(booking: any, map: Record<string, any>): string {
  const personId = booking.relationships?.person?.data?.id;
  if (!personId) return personId ?? 'Unknown';
  const person = map[`people:${personId}`];
  if (!person) return personId;
  const { first_name, last_name } = person.attributes ?? {};
  return `${first_name ?? ''} ${last_name ?? ''}`.trim() || personId;
}

/** Calculate hours per day from booking attributes */
function calcHoursPerDay(attr: any): number | null {
  const days = attr.total_working_days ?? 1;
  if (days === 0) return null;
  if (attr.total_time != null) return Math.round((attr.total_time / days / 60) * 10) / 10;
  if (attr.percentage != null) return Math.round((attr.percentage / 100) * 8 * 10) / 10;
  if (attr.hours != null) return Math.round((attr.hours / days) * 10) / 10;
  return null;
}

function stageLabel(attr: any): string {
  if (attr.draft) return 'draft';
  return attr.stage_type === 1 ? 'tentative' : attr.stage_type === 2 ? 'confirmed' : 'unknown';
}

export async function getResourcePlanHandler(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const params = getResourcePlanSchema.parse(args ?? {});
  const { after, before } = defaultDateRange();

  try {
    const { bookings, included } = await client.listBookingsWithIncluded({
      after: params.after ?? after,
      before: params.before ?? before,
    });

    if (bookings.length === 0) {
      return { content: [{ type: 'text', text: 'No bookings found for the given period.' }] };
    }

    const map = buildIncludedMap(included);

    const byPerson: Record<string, Array<{ booking: any; projectName: string; hpd: number | null; stage: string }>> = {};

    for (const booking of bookings) {
      const personName = resolvePersonName(booking, map);
      const projectName = resolveProjectName(booking, map);
      const hpd = calcHoursPerDay(booking.attributes ?? {});
      const stage = stageLabel(booking.attributes ?? {});

      if (params.person_name && !personName.toLowerCase().includes(params.person_name.toLowerCase())) continue;
      if (params.project_name && !projectName.toLowerCase().includes(params.project_name.toLowerCase())) continue;

      if (!byPerson[personName]) byPerson[personName] = [];
      byPerson[personName].push({ booking, projectName, hpd, stage });
    }

    const lines: string[] = [`# Resource Plan: ${params.after ?? after} → ${params.before ?? before}\n`];
    lines.push(`**${Object.keys(byPerson).length} people booked | ${bookings.length} total bookings**\n`);

    for (const [person, entries] of Object.entries(byPerson).sort()) {
      const peakHpd = Math.max(...entries.map(e => e.hpd ?? 0));
      const peakPct = Math.round((peakHpd / 8) * 100);
      const rag = peakPct >= 100 ? '🔴' : peakPct >= 75 ? '🟡' : '🟢';
      lines.push(`## ${rag} ${person} (peak ${peakPct}% utilisation)`);
      for (const { booking, projectName, hpd, stage } of entries) {
        const attr = booking.attributes ?? {};
        const hpdStr = hpd != null ? `${hpd}h/day (${Math.round((hpd / 8) * 100)}%)` : '? h/day';
        lines.push(`  - **${projectName}** | ${attr.started_on} → ${attr.ended_on} | ${hpdStr} | ${stage}`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error fetching resource plan: ${err.message}` }] };
  }
}

export async function getOverbookedPeopleHandler(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const params = getOverbookedSchema.parse(args ?? {});
  const { after, before } = defaultDateRange();
  const threshold = params.threshold_pct ?? 100;
  const thresholdHpd = (threshold / 100) * 8;

  try {
    const { bookings, included } = await client.listBookingsWithIncluded({
      after: params.after ?? after,
      before: params.before ?? before,
    });

    if (bookings.length === 0) {
      return { content: [{ type: 'text', text: 'No bookings found for the given period.' }] };
    }

    const map = buildIncludedMap(included);

    const byPerson: Record<string, Array<{ booking: any; projectName: string; hpd: number | null }>> = {};
    for (const booking of bookings) {
      const personName = resolvePersonName(booking, map);
      const projectName = resolveProjectName(booking, map);
      const hpd = calcHoursPerDay(booking.attributes ?? {});
      if (!byPerson[personName]) byPerson[personName] = [];
      byPerson[personName].push({ booking, projectName, hpd });
    }

    const overbooked: Array<{ person: string; totalHpd: number; pct: number; entries: any[] }> = [];

    for (const [person, entries] of Object.entries(byPerson)) {
      for (let i = 0; i < entries.length; i++) {
        const b1 = entries[i].booking;
        const s1 = b1.attributes?.started_on ?? '';
        const e1 = b1.attributes?.ended_on ?? '';

        const overlapping = entries.filter(({ booking: b2 }) => {
          const s2 = b2.attributes?.started_on ?? '';
          const e2 = b2.attributes?.ended_on ?? '';
          return s1 <= e2 && e1 >= s2;
        });

        if (overlapping.length > 1) {
          const totalHpd = overlapping.reduce((s, e) => s + (e.hpd ?? 0), 0);
          const pct = Math.round((totalHpd / 8) * 100);
          if (totalHpd > thresholdHpd && !overbooked.find(o => o.person === person)) {
            overbooked.push({ person, totalHpd: Math.round(totalHpd * 10) / 10, pct, entries: overlapping });
          }
          break;
        }
      }
    }

    if (overbooked.length === 0) {
      return { content: [{ type: 'text', text: `✅ No overbooking detected above ${threshold}% (${thresholdHpd}h/day) in ${params.after ?? after} → ${params.before ?? before}.` }] };
    }

    const lines: string[] = [`# ⚠️ Overbooked People (>${threshold}% / >${thresholdHpd}h/day)\n`];
    lines.push(`**${overbooked.length} people overbooked | ${params.after ?? after} → ${params.before ?? before}**\n`);

    for (const { person, totalHpd, pct, entries } of overbooked.sort((a, b) => b.pct - a.pct)) {
      lines.push(`## 🔴 ${person} — ${totalHpd}h/day (${pct}%)`);
      for (const { booking, projectName, hpd } of entries) {
        const attr = booking.attributes ?? {};
        const hpdStr = hpd != null ? `${hpd}h/day` : '?h/day';
        lines.push(`  - ${projectName}: ${attr.started_on} → ${attr.ended_on} @ ${hpdStr}`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error detecting overbooking: ${err.message}` }] };
  }
}
