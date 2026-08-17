/**
 * @fileoverview Tests the URLs ProductiveAPIClient actually builds.
 *
 * The tool-level tests mock the client, so they pin what a tool *asks for* and not what the
 * client *sends*. Without this file, renaming a query parameter or a path segment leaves the
 * whole suite green while every real request breaks.
 *
 * @module api/__tests__/client-requests.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProductiveAPIClient } from '../client.js';
import { Config } from '../../config/index.js';

const config = {
  PRODUCTIVE_API_TOKEN: 'secret-token',
  PRODUCTIVE_ORG_ID: '1',
  PRODUCTIVE_API_BASE_URL: 'https://api.test/',
  PRODUCTIVE_ATTACHMENT_DIR: '/cache',
} as Config;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stubs fetch with an empty-but-valid JSON:API body and returns the spy. */
function stubFetch() {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: [] }),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** The URL of the single request made, parsed. */
function urlOf(spy: ReturnType<typeof stubFetch>): URL {
  expect(spy).toHaveBeenCalledTimes(1);
  return new URL(spy.mock.calls[0][0] as string);
}

describe('listTasks request', () => {
  it('sends the parent_task_id filter that list_subtasks depends on', async () => {
    const spy = stubFetch();

    await new ProductiveAPIClient(config).listTasks({ parent_task_id: '19300600' });

    const url = urlOf(spy);
    expect(url.pathname).toBe('/tasks');
    expect(url.searchParams.get('filter[parent_task_id]')).toBe('19300600');
    expect(url.searchParams.get('include')).toBe('assignee,workflow_status');
  });

  it('maps limit and page onto JSON:API page params', async () => {
    const spy = stubFetch();

    await new ProductiveAPIClient(config).listTasks({ parent_task_id: '1', limit: 30, page: 2 });

    const url = urlOf(spy);
    expect(url.searchParams.get('page[size]')).toBe('30');
    expect(url.searchParams.get('page[number]')).toBe('2');
  });

  it('omits filters that were not asked for', async () => {
    const spy = stubFetch();

    await new ProductiveAPIClient(config).listTasks({ project_id: '813033' });

    const url = urlOf(spy);
    expect(url.searchParams.get('filter[project_id]')).toBe('813033');
    expect(url.searchParams.has('filter[parent_task_id]')).toBe(false);
    expect(url.searchParams.has('filter[assignee_id]')).toBe(false);
  });
});

describe('getProject request', () => {
  it('hits the projects collection with the requested include', async () => {
    const spy = stubFetch();

    await new ProductiveAPIClient(config).getProject('813033', 'workflow');

    const url = urlOf(spy);
    expect(url.pathname).toBe('/projects/813033');
    expect(url.searchParams.get('include')).toBe('workflow');
  });

  it('omits the include entirely when none is given', async () => {
    const spy = stubFetch();

    await new ProductiveAPIClient(config).getProject('813033');

    expect(urlOf(spy).search).toBe('');
  });
});

describe('getTask request', () => {
  it('hits the tasks collection with the requested include', async () => {
    const spy = stubFetch();

    await new ProductiveAPIClient(config).getTask('19300600', 'task_list,assignee');

    const url = urlOf(spy);
    expect(url.pathname).toBe('/tasks/19300600');
    expect(url.searchParams.get('include')).toBe('task_list,assignee');
  });
});

describe('listWorkflowStatuses request', () => {
  it('filters by workflow and carries the page size update_task_status relies on', async () => {
    const spy = stubFetch();

    await new ProductiveAPIClient(config).listWorkflowStatuses({ workflow_id: '36508', limit: 200 });

    const url = urlOf(spy);
    expect(url.pathname).toBe('/workflow_statuses');
    expect(url.searchParams.get('filter[workflow_id]')).toBe('36508');
    expect(url.searchParams.get('page[size]')).toBe('200');
  });
});

describe('request headers', () => {
  it('sends auth and org headers on every request', async () => {
    const spy = stubFetch();

    await new ProductiveAPIClient(config).getProject('813033');

    const headers = spy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-Auth-Token']).toBe('secret-token');
    expect(headers['X-Organization-Id']).toBe('1');
    expect(headers['Content-Type']).toBe('application/vnd.api+json');
  });
});
