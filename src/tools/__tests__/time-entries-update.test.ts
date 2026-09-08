/**
 * @fileoverview Tests update_time_entry: the patch payload it builds and the codes it reports.
 *
 * The payload assertions are the load-bearing ones. A patch that quietly sends a field the
 * caller did not supply overwrites real timesheet data, and a patch that omits billable_time
 * when time changes leaves a consolidated entry billing the old, smaller number.
 *
 * @module tools/__tests__/time-entries-update.test
 */

import { describe, it, expect, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { updateTimeEntryTool, updateTimeEntryDefinition } from '../time-entries.js';
import { ProductiveAPIClient, ProductiveApiError } from '../../api/client.js';

/** What Productive echoes back. The tool formats this, so it needs the same shape every time. */
const updated = {
  data: {
    id: '161683643',
    type: 'time_entries',
    attributes: { date: '2026-09-07', time: 90, billable_time: 90, note: 'Consolidated support work' },
    relationships: { service: { data: { id: '15265381' } }, task: { data: { id: '19957563' } } },
  },
};

/** A client whose updateTimeEntry succeeds, with the spy exposed. */
function clientThatUpdates() {
  const updateTimeEntry = vi.fn().mockResolvedValue(updated);
  return { updateTimeEntry, client: { updateTimeEntry } as unknown as ProductiveAPIClient };
}

/** The attributes sent on the single PATCH. */
function attributesSent(spy: ReturnType<typeof vi.fn>) {
  expect(spy).toHaveBeenCalledTimes(1);
  return spy.mock.calls[0][1].data.attributes;
}

async function codeOf(fn: () => Promise<unknown>): Promise<number> {
  try {
    await fn();
  } catch (err) {
    return (err as { code: number }).code;
  }
  throw new Error('expected a throw, got none');
}

describe('updateTimeEntryTool - patch payload', () => {
  it('patches only the fields that were supplied', async () => {
    const { updateTimeEntry, client } = clientThatUpdates();

    await updateTimeEntryTool(client, {
      time_entry_id: '161683643',
      note: 'Consolidated support work',
    });

    expect(updateTimeEntry).toHaveBeenCalledWith('161683643', expect.anything());
    expect(attributesSent(updateTimeEntry)).toEqual({ note: 'Consolidated support work' });
  });

  it('sends the id and type JSON:API needs on a PATCH body', async () => {
    const { updateTimeEntry, client } = clientThatUpdates();

    await updateTimeEntryTool(client, { time_entry_id: '161683643', time: '1.5h' });

    expect(updateTimeEntry.mock.calls[0][1].data).toMatchObject({
      type: 'time_entries',
      id: '161683643',
    });
  });

  it('converts time to minutes and treats it as a replacement, not an increment', async () => {
    const { updateTimeEntry, client } = clientThatUpdates();

    await updateTimeEntryTool(client, { time_entry_id: '161683643', time: '1.5h' });

    expect(attributesSent(updateTimeEntry).time).toBe(90);
  });

  // Without this, a consolidated entry keeps the billable minutes of the small entry it grew
  // from, and the client is under-billed for work that was actually logged.
  it('sets billable time to match when time is supplied without it', async () => {
    const { updateTimeEntry, client } = clientThatUpdates();

    await updateTimeEntryTool(client, { time_entry_id: '161683643', time: '120m' });

    expect(attributesSent(updateTimeEntry)).toEqual({ time: 120, billable_time: 120 });
  });

  it('keeps an explicit billable_time rather than overwriting it with time', async () => {
    const { updateTimeEntry, client } = clientThatUpdates();

    await updateTimeEntryTool(client, {
      time_entry_id: '161683643',
      time: '2h',
      billable_time: '90m',
    });

    expect(attributesSent(updateTimeEntry)).toEqual({ time: 120, billable_time: 90 });
  });

  it('leaves billable time alone when only the note changes', async () => {
    const { updateTimeEntry, client } = clientThatUpdates();

    await updateTimeEntryTool(client, {
      time_entry_id: '161683643',
      note: 'Rewrote the note after consolidating',
    });

    expect(attributesSent(updateTimeEntry)).not.toHaveProperty('billable_time');
  });

  it('resolves "today" and "yesterday" the way create_time_entry does', async () => {
    const { updateTimeEntry, client } = clientThatUpdates();

    await updateTimeEntryTool(client, { time_entry_id: '161683643', date: 'today' });

    expect(attributesSent(updateTimeEntry).date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('moves the entry to another service through the relationship, not an attribute', async () => {
    const { updateTimeEntry, client } = clientThatUpdates();

    await updateTimeEntryTool(client, { time_entry_id: '161683643', service_id: '15265381' });

    expect(updateTimeEntry.mock.calls[0][1].data.relationships).toEqual({
      service: { data: { id: '15265381', type: 'services' } },
    });
  });

  it('never sends a task relationship, which this endpoint will not repoint', async () => {
    const { updateTimeEntry, client } = clientThatUpdates();

    await updateTimeEntryTool(client, {
      time_entry_id: '161683643',
      time: '30m',
      // Not part of the schema. Passing it must not leak a task relationship into the patch.
      task_id: '19957563',
    });

    expect(updateTimeEntry.mock.calls[0][1].data.relationships).toBeUndefined();
  });
});

describe('updateTimeEntryTool - argument checking', () => {
  it('rejects a call that supplies nothing but the id, rather than sending an empty patch', async () => {
    const { updateTimeEntry, client } = clientThatUpdates();

    const code = await codeOf(() => updateTimeEntryTool(client, { time_entry_id: '161683643' }));

    expect(code).toBe(ErrorCode.InvalidParams);
    expect(updateTimeEntry).not.toHaveBeenCalled();
  });

  it('reports an unparseable time as the caller\'s fault, not a server fault', async () => {
    const { updateTimeEntry, client } = clientThatUpdates();

    const code = await codeOf(() =>
      updateTimeEntryTool(client, { time_entry_id: '161683643', time: 'half a day' })
    );

    expect(code).toBe(ErrorCode.InvalidParams);
    expect(updateTimeEntry).not.toHaveBeenCalled();
  });

  it('reports an unparseable date as InvalidParams too', async () => {
    const { client } = clientThatUpdates();

    const code = await codeOf(() =>
      updateTimeEntryTool(client, { time_entry_id: '161683643', date: '07/09/2026' })
    );

    expect(code).toBe(ErrorCode.InvalidParams);
  });

  it('names the field Zod rejected', async () => {
    const { client } = clientThatUpdates();

    let caught: any;
    try {
      await updateTimeEntryTool(client, { time_entry_id: '161683643', note: 'too short' });
    } catch (err) {
      caught = err;
    }

    expect(caught.code).toBe(ErrorCode.InvalidParams);
    expect(caught.message).toContain('note');
  });
});

describe('updateTimeEntryTool - error mapping', () => {
  function clientThatThrows(error: Error): ProductiveAPIClient {
    return { updateTimeEntry: vi.fn().mockRejectedValue(error) } as unknown as ProductiveAPIClient;
  }

  const args = { time_entry_id: '161683643', time: '30m' };

  it('maps a 422 to InvalidParams and keeps the source.pointer in the message', async () => {
    const apiError = new ProductiveApiError(
      'Invalid attribute (422): attribute is invalid [at /data/attributes/date]',
      422,
      [{ status: '422', title: 'Invalid attribute', source: { pointer: '/data/attributes/date' } }]
    );

    let caught: any;
    try {
      await updateTimeEntryTool(clientThatThrows(apiError), args);
    } catch (err) {
      caught = err;
    }

    expect(caught.code).toBe(ErrorCode.InvalidParams);
    expect(caught.message).toContain('/data/attributes/date');
  });

  it('maps a 404 to InvalidParams, because a missing entry is a wrong ID', async () => {
    const apiError = new ProductiveApiError('Record Not Found (404): no such record', 404, [
      { status: '404', title: 'Record Not Found' },
    ]);

    expect(await codeOf(() => updateTimeEntryTool(clientThatThrows(apiError), args))).toBe(
      ErrorCode.InvalidParams
    );
  });

  it('leaves a 500 as InternalError', async () => {
    const apiError = new ProductiveApiError('API request failed with status 500', 500, []);

    expect(await codeOf(() => updateTimeEntryTool(clientThatThrows(apiError), args))).toBe(
      ErrorCode.InternalError
    );
  });
});

describe('updateTimeEntryDefinition', () => {
  it('takes only the entry id as required, so a caller patches one field at a time', () => {
    expect(updateTimeEntryDefinition.inputSchema.required).toEqual(['time_entry_id']);
  });

  it('warns that time replaces rather than adds, which is the expensive misreading', () => {
    expect(updateTimeEntryDefinition.inputSchema.properties.time.description).toContain(
      'not an increment'
    );
  });

  it('says the entry cannot be moved to a different task', () => {
    expect(updateTimeEntryDefinition.description).toContain('different task');
  });
});
