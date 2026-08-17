/**
 * @fileoverview Spot-checks the error-code sweep on tools that previously mapped inline.
 *
 * Each of these collapsed every failure into InternalError, so "you asked for a project that
 * does not exist" was indistinguishable from "Productive fell over". The guard in
 * task-tools-client.test.ts stops inline mapping coming back; this checks the behaviour that
 * guard exists to protect.
 *
 * @module tools/__tests__/error-codes-sweep.test
 */

import { describe, it, expect, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveAPIClient, ProductiveApiError } from '../../api/client.js';
import { listCompaniesTool } from '../companies.js';
import { listProjectsTool } from '../projects.js';
import { getPersonTool } from '../people.js';
import { listTaskLists } from '../task-lists.js';
import { getFolder } from '../folders.js';
import { listBoards } from '../boards.js';

function apiError(status: number) {
  return new ProductiveApiError(`Error (${status}): something went wrong`, status, [
    { status: String(status), title: 'Error' },
  ]);
}

function clientRejecting(method: string, error: Error): ProductiveAPIClient {
  return { [method]: vi.fn().mockRejectedValue(error) } as unknown as ProductiveAPIClient;
}

async function codeOf(fn: () => Promise<unknown>): Promise<number> {
  try {
    await fn();
  } catch (err) {
    return (err as { code: number }).code;
  }
  throw new Error('expected a throw, got none');
}

// Note: boards.ts, task-lists.ts and folders.ts name the HANDLER `listBoards` and the
// DEFINITION `listBoardsTool`, inverted from every other tool file. Easy to import wrongly.
const CASES = [
  { name: 'list_companies', method: 'listCompanies', run: listCompaniesTool, args: {} },
  { name: 'list_projects', method: 'listProjects', run: listProjectsTool, args: {} },
  { name: 'get_person', method: 'getPerson', run: getPersonTool, args: { person_id: '1' } },
  { name: 'list_task_lists', method: 'listTaskLists', run: listTaskLists, args: {} },
  { name: 'get_folder', method: 'getFolder', run: getFolder, args: { folder_id: '1' } },
  { name: 'list_boards', method: 'listBoards', run: listBoards, args: {} },
] as const;

describe.each(CASES)('$name', (c) => {
  it('reports a 404 as InvalidParams', async () => {
    const code = await codeOf(() => c.run(clientRejecting(c.method, apiError(404)), { ...c.args }));

    expect(code).toBe(ErrorCode.InvalidParams);
  });

  it('reports a 422 as InvalidParams', async () => {
    const code = await codeOf(() => c.run(clientRejecting(c.method, apiError(422)), { ...c.args }));

    expect(code).toBe(ErrorCode.InvalidParams);
  });

  it('still reports a 500 as InternalError', async () => {
    const code = await codeOf(() => c.run(clientRejecting(c.method, apiError(500)), { ...c.args }));

    expect(code).toBe(ErrorCode.InternalError);
  });

  it('still reports a 403 as InternalError, since no argument fixes it', async () => {
    const code = await codeOf(() => c.run(clientRejecting(c.method, apiError(403)), { ...c.args }));

    expect(code).toBe(ErrorCode.InternalError);
  });
});

describe('zod messages', () => {
  it('names the offending field, which several inline handlers used to do', async () => {
    let caught: any;
    try {
      await getPersonTool(clientRejecting('getPerson', apiError(500)), { person_id: '' });
    } catch (err) {
      caught = err;
    }

    expect(caught.code).toBe(ErrorCode.InvalidParams);
    expect(caught.message).toContain('person_id');
  });
});
