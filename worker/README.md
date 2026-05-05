# Productive MCP Worker

Cloudflare Worker hosting a remote [Model Context Protocol](https://modelcontextprotocol.io/) server for the [Productive.io](https://productive.io) API.

The Worker is fronted by **Cloudflare Access** for authentication. A small middleware reads the
`Cf-Access-Authenticated-User-Email` header, looks the email up in a `USER_MAPPING` secret
(JSON: `{ "<email>": { "userId": <id>, "apiToken": "<token>" }, ... }`), and injects the matching
`userId` and `apiToken` into the per-request MCP server config. Each user authenticates against
the Productive API with their own token.

Tool implementations are ported from the local stdio server in `../productive-mcp/`.

## Endpoints

| Path                | Purpose                              |
| ------------------- | ------------------------------------ |
| `GET  /health`      | Liveness probe (no auth)             |
| `POST /mcp`         | Streamable HTTP MCP transport        |
| `GET  /sse`         | SSE MCP transport                    |
| `POST /sse/message` | SSE MCP message endpoint             |

All MCP endpoints require Cloudflare Access headers and an entry in the `USER_MAPPING` secret.
Unknown emails get `403`; missing Access headers get `401`.

## Configuration

Non-secret defaults live in `wrangler.jsonc` under `vars`. Secrets are set via Wrangler:

```sh
# Org-wide
wrangler secret put PRODUCTIVE_ORG_ID

# Per-user mapping (email -> { userId, apiToken })
wrangler secret put USER_MAPPING < users.json
```

`users.json` example:

```json
{
  "alice@example.com": { "userId": 123456, "apiToken": "alice-token" },
  "bob@example.com":   { "userId": 234567, "apiToken": "bob-token"   }
}
```

For local development, create `.dev.vars` next to `wrangler.jsonc`:

```
PRODUCTIVE_ORG_ID=...
USER_MAPPING={"alice@example.com":{"userId":123456,"apiToken":"..."}}
```

## Local development

```sh
npm install
npm run dev
```

Wrangler does not inject Cloudflare Access headers locally — supply them manually when testing:

```sh
curl -X POST http://localhost:8787/mcp \
  -H "Cf-Access-Authenticated-User-Email: alice@example.com" \
  -H "Cf-Access-Jwt-Assertion: dev-only-placeholder" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Deploying

```sh
npm run deploy
```

After deploy, place the Worker route behind a Cloudflare Access application — see
[Secure MCP servers with Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/secure-mcp-servers/).

## Hardening

The middleware checks for the presence of `Cf-Access-Jwt-Assertion` but does not validate the JWT
signature. For defense-in-depth (in case the Worker is ever reachable without Access in front),
validate the JWT against your team's JWKS:
<https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/>.
