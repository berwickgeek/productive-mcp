# CLAUDE.md

An MCP server exposing the Productive.io API over stdio. Plain TypeScript compiled to ESM
and run under Node. **No React, no Next.js, no JSX, no browser, no bundler.** If you find
yourself reaching for a UI convention here, you are in the wrong repo.

## Commands

```bash
npm test              # vitest, the real number (see the vitest.config.ts note below)
npm run type-check    # tsc --noEmit
npm run build         # tsc + chmod, emits build/
npm run dev           # tsc --watch
node scripts/smoke-test.mjs   # start the built server, assert the surface it serves
```

CI runs type-check, test, build and the smoke test on Node 20 and 22, plus a Node 18 job that
runs the built output on the lowest version `engines` allows. Run all four locally before
pushing.

## Architecture

```
src/
├── index.ts          # entry point, calls createServer()
├── server.ts         # tool registry + the CallTool switch. Every tool is wired here.
├── server-instructions.ts  # SERVER_INFO + the instructions clients surface
├── api/
│   ├── client.ts     # ProductiveAPIClient: ALL HTTP goes through this
│   └── types.ts      # JSON:API response shapes
├── tools/            # one file per domain (tasks, comments, pages, todos, ...)
│   └── annotations.ts  # the behaviour-hint table for all 72 tools
├── utils/            # errors.ts, confirm.ts, attachments.ts, html.ts, mentions.ts
├── config/           # env validation
└── prompts/
```

**The client/tool split is the main rule.** `src/api/client.ts` owns every HTTP call.
Tools parse arguments, call a client method, and format text. A tool must never call `fetch`
directly: doing so bypasses the JSON:API error diagnostics and produces an opaque
`statusText`. A test in `src/tools/__tests__/task-tools-client.test.ts` fails the build if any
file under `src/tools` calls `fetch`.

### Adding a tool

Four places, all required:

1. A handler and a `*Definition` object in the relevant `src/tools/*.ts`.
2. A client method in `src/api/client.ts` if it needs a new endpoint.
3. The definition in `toolDefinitions` **and** a `case` in the `CallToolRequestSchema` switch
   in `src/server.ts`. Missing the switch case registers a tool that cannot be called.
4. An entry in `TOOL_ANNOTATIONS` (`src/tools/annotations.ts`). A test fails if a registered
   tool has no entry, and vice versa.

Each schema is written twice: Zod for runtime validation, and a hand-written JSON Schema
literal in the definition. Nothing enforces that they agree, so change both together.

## Gotchas

**The MCP client runs `build/`, not `src/`.** Nothing watches. After any change you must
`npm run build` and restart the MCP connection, or you are silently testing the previous
compile.

**`instructions` goes in ServerOptions, the second `new Server(...)` argument.** A
`description` key on the first argument (the `Implementation` object) is not an MCP field and
is silently discarded. That bug shipped once and meant the server delivered no guidance at all
for months. See `src/server-instructions.ts`.

**A relationship you did not `include` comes back as `{"meta": {"included": false}}`,** not
as `{"data": ...}`. Reading a relationship you did not request returns nothing, silently.

**`vitest.config.ts` exists to stop vitest collecting `build/`.** Without it the compiled
copies of every test are collected too, roughly doubling the reported count and letting a
stale build keep an edited test passing. Do not pass `--dir src`: it conflicts with the
config's `include` and finds nothing. Just run `npm test`.

**Force-push is blocked on the dev box.** To bring a branch up to date, merge `main` into it.
Do not plan around a rebase.

**`.env` holds a live token for a production Productive org, not a sandbox.** Prefer
read-only calls when testing against the real API. Destructive tools are gated (below), but
the gate is a speed bump, not authorisation.

**`npm run build` fails on Windows.** The script is `tsc && chmod +x build/index.js` and `chmod`
does not exist in cmd or PowerShell. Run `npx tsc` directly. Then kill the stale server
processes: every Claude Code session spawns its own instance and each keeps the old code in
memory, so a fix can look like it did nothing.
`Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match 'productive-mcp' } | Stop-Process`.
Verify with `node scripts/verify-list-comments.mjs <task_id>`. A second clone at
`C:\VSCode\AI\productive-mcp` used to be what the global MCP config ran, 62 commits behind this
one; it has been removed and this clone is the only one.

**`create_task` with `status: "open"` lands the task in Pending, not Open,** and the tool's own
success echo reports the wrong status. Confirmed on task 19996350 (2026-09-08). Callers follow
with `update_task_status` (`status_name: "Open"`). Fixable at source in the tool.

**`list_comments` returns oldest-first, default cap about 30, no sort or page parameter.** On a
long thread the newest comments fall off the end, so a poller sees only old ones and reports
nothing new forever. Callers pass `limit=100` or higher. Fixable at source.

**`create_time_entry` failing with `-32603 attribute is invalid` (or `422 ... [at
data/attributes/task]`) means the `service_id` is not in the task's budget.** Productive reports
a service mismatch as a task error. The right service is per project budget; there is no
organisation-wide support service. Verify against a sibling task's existing entry
(`list_time_entries task_id=<id>`) before suspecting the MCP.

**Comment and description bodies render a narrow HTML whitelist.** Verified to render: `<p>`,
`<strong>`, `<em>`, `<ul>`, `<ol>`, `<li>`, `<a href>`, `<div>`, `<code>`, `<pre>`. Verified to
escape to literal text: `<small>`. Expect the same for `<hr>`, `<br>`, `<blockquote>`, headings
and tables. Markdown renders as literal syntax. Escape literal angle brackets, including inside
`<pre>`. See `docs/api-surface.md` for the rest of the API notes.

## Conventions

- Destructive tools take `confirm` (defaulting to false, never `required`). The first call
  looks the record up, describes it, and returns without deleting. See `src/utils/confirm.ts`.
- Errors should go through `toMcpError` (`src/utils/errors.ts`): 400, 404 and 422 become
  `InvalidParams`, everything else `InternalError`. This is **partially migrated**. Roughly 70
  handlers across 19 files still map inline, collapsing everything to `InternalError`, so a
  bad argument is indistinguishable from a server fault. Files are mixed: a file using
  `toMcpError` in one tool often still maps inline in another. When you touch a handler,
  convert it.
- Tool descriptions carry cross-tool routing where it matters, but a description cannot
  express "call A before B", because a model weighs each one alone and the literal name match
  wins. Server-level routing rules belong in `server-instructions.ts`.
- Comment and description bodies are HTML. Mentions are inline JSON blobs (`@[{...}]`);
  `src/utils/mentions.ts` renders them.
- Semantic commits: `feat:`, `fix:`, `refactor:`, `test:`, `ci:`, `chore:`.

## Testing

Vitest, no DOM, no React Testing Library. Tests sit in `__tests__` folders beside the code.

Mock at the right layer. Tool tests mock `ProductiveAPIClient` wholesale, which pins what a
tool *asks for* but never what the client *sends*, so client URL building needs its own tests
stubbing `global.fetch` (`src/api/__tests__/client-requests.test.ts`). Mutation-test anything
load-bearing: break the thing on purpose and confirm a test goes red. A green suite proved
nothing when a query parameter was renamed to garbage.

Tests must pass with no credentials. CI runs them with none, deliberately.

## Environment

`PRODUCTIVE_API_TOKEN` and `PRODUCTIVE_ORG_ID` are required. `PRODUCTIVE_USER_ID` (enables
the `"me"` shorthand), `PRODUCTIVE_API_BASE_URL` and `PRODUCTIVE_ATTACHMENT_DIR` are optional.

`"me"` is resolved per-tool, not centrally. Only `create_task`, `update_task_assignment`,
`create_time_entry` and `list_time_entries` honour it. `list_tasks` forwards `assignee_id`
straight to the API, so `"me"` there is not a filter. Use `my_tasks` to list your own tasks.

## Registration

Register this server per project, not globally: the token is a live production credential and a
global entry would hand it to every session on the machine. `lpbwa-support/.mcp.json` runs it
through `cmd /c "cd /d C:\VSCode\productive-mcp && node build\index.js"` so that dotenv finds
this repo's `.env`; `config()` in `src/config/index.ts` loads from the working directory, so the
working directory must be this repo.
