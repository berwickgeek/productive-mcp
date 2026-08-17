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

## Conventions

- Destructive tools take `confirm` (defaulting to false, never `required`). The first call
  looks the record up, describes it, and returns without deleting. See `src/utils/confirm.ts`.
- Errors go through `toMcpError` (`src/utils/errors.ts`): 400, 404 and 422 become
  `InvalidParams`, everything else `InternalError`. `time-entries.ts` still has its own inline
  422 check and is the last holdout.
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
