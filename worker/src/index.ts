import { McpAgent } from "agents/mcp";
import { createMcpServer } from "./mcp.js";
import { parseConfig, type Config } from "./config/index.js";

/**
 * Per-user record stored in the USER_MAPPING secret.
 */
interface UserEntry {
  userId: string | number;
  apiToken: string;
}

/**
 * Shape of the USER_MAPPING secret:
 *   {
 *     "alice@example.com": { "userId": 123, "apiToken": "..." },
 *     "bob@example.com":   { "userId": 456, "apiToken": "..." }
 *   }
 *
 * Set with:
 *   wrangler secret put USER_MAPPING < users.json
 */
type UserMapping = Record<string, UserEntry>;

const ACCESS_EMAIL_HEADER = "Cf-Access-Authenticated-User-Email";
const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

interface AuthContext extends Record<string, unknown> {
  email: string;
  productiveUserId: string;
  productiveApiToken: string;
}

/**
 * Per-request props made available to the McpAgent instance via ctx.props.
 * The agents runtime serializes these into the Durable Object session.
 */
type Props = AuthContext;

function parseUserMapping(raw: string | undefined): UserMapping {
  if (!raw) {
    throw new Error("USER_MAPPING secret is not set");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `USER_MAPPING is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("USER_MAPPING must be a JSON object keyed by email");
  }
  return parsed as UserMapping;
}

export class ProductiveMcp extends McpAgent<Env, unknown, Props> {
  // Assigned in init(). Typed loosely to accommodate the low-level Server.
  // biome-ignore lint/suspicious/noExplicitAny: agents SDK accepts Server | McpServer
  server: any;

  async init() {
    const env = this.env as Env & {
      PRODUCTIVE_ORG_ID?: string;
    };
    const config: Config = parseConfig({
      // Per-user API token resolved from USER_MAPPING by the Access middleware.
      PRODUCTIVE_API_TOKEN: this.props?.productiveApiToken,
      PRODUCTIVE_ORG_ID: env.PRODUCTIVE_ORG_ID,
      PRODUCTIVE_API_BASE_URL: env.PRODUCTIVE_API_BASE_URL,
      PRODUCTIVE_USER_ID: this.props?.productiveUserId,
    });

    this.server = createMcpServer(config);
  }
}

/**
 * Validate the Cloudflare Access headers and resolve to a Productive user.
 * Returns either an AuthContext or a Response describing the rejection.
 *
 * NOTE: Cloudflare Access guarantees these headers when the route is fronted by
 * an Access application; we additionally require Cf-Access-Jwt-Assertion to
 * defend against direct hits if the Access policy is ever misconfigured.
 * For full defense-in-depth, verify the JWT against your team's JWKS — see
 * https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */
function authenticate(
  request: Request,
  mapping: UserMapping,
): AuthContext | Response {
  const email = request.headers.get(ACCESS_EMAIL_HEADER);
  const jwt = request.headers.get(ACCESS_JWT_HEADER);

  if (!email || !jwt) {
    return new Response("Unauthorized: missing Cloudflare Access headers", {
      status: 401,
    });
  }

  const normalizedEmail = email.toLowerCase();
  // Allow either lowercase or exact-case key in the mapping.
  const entry = mapping[normalizedEmail] ?? mapping[email];
  if (!entry || !entry.apiToken || entry.userId === undefined) {
    return new Response(
      `Forbidden: ${email} is not authorized to use this MCP server`,
      { status: 403 },
    );
  }

  return {
    email: normalizedEmail,
    productiveUserId: String(entry.userId),
    productiveApiToken: entry.apiToken,
  };
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    const isMcp = url.pathname === "/mcp";
    const isSse = url.pathname === "/sse" || url.pathname === "/sse/message";
    if (!isMcp && !isSse) {
      return new Response("Not found", { status: 404 });
    }

    let mapping: UserMapping;
    try {
      mapping = parseUserMapping(
        (env as Env & { USER_MAPPING?: string }).USER_MAPPING,
      );
    } catch (err) {
      console.error("USER_MAPPING configuration error:", err);
      return new Response("Server misconfigured", { status: 500 });
    }

    const auth = authenticate(request, mapping);
    if (auth instanceof Response) return auth;

    // Pass auth context through to the McpAgent via ctx.props.
    // The agents SDK reads ctx.props and stores them as `this.props` on the agent.
    (ctx as unknown as { props: Props }).props = auth;

    if (isMcp) {
      return ProductiveMcp.serve("/mcp").fetch(request, env, ctx);
    }
    return ProductiveMcp.serveSSE("/sse").fetch(request, env, ctx);
  },
};
