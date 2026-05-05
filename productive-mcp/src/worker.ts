import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { createMcpServer } from './server.js';
import { parseConfig } from './config/index.js';

type WorkerEnv = {
  PRODUCTIVE_API_TOKEN: string;
  PRODUCTIVE_ORG_ID: string;
  PRODUCTIVE_USER_ID?: string;
  PRODUCTIVE_API_BASE_URL?: string;
};

function toConfigInput(env: WorkerEnv): Record<string, string | undefined> {
  return {
    PRODUCTIVE_API_TOKEN: env.PRODUCTIVE_API_TOKEN,
    PRODUCTIVE_ORG_ID: env.PRODUCTIVE_ORG_ID,
    PRODUCTIVE_USER_ID: env.PRODUCTIVE_USER_ID,
    PRODUCTIVE_API_BASE_URL: env.PRODUCTIVE_API_BASE_URL,
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname !== '/mcp') {
      return new Response('Not Found', { status: 404 });
    }

    const config = parseConfig(toConfigInput(env));
    const server = createMcpServer(config);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);

    try {
      return await transport.handleRequest(request);
    } finally {
      await transport.close();
      await server.close();
    }
  },
};
