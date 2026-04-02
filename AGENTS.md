# CodeClaw

OpenCode plugin that bridges Telegram to an OpenCode server. TypeScript, grammY, `@opencode-ai/plugin`.

## Architecture

Single process — the plugin runs inside the OpenCode server. No separate bridge service.

```
Telegram <-> Plugin (grammY bot) <-> OpenCode Server (in-process)
```

The server loads the plugin at startup. The Telegram bot is **on-demand** by default — it only connects when the `telegram` tool is called with `action: "connect"` (or via `/telegram connect` command). Set `TELEGRAM_AUTOCONNECT=1` to auto-start (the systemd unit does this). The plugin receives server events via the plugin `event` hook.

## Source Layout

```
src/
  main.ts        -- plugin entry: env validation, on-demand bot, telegram tool, event hook
  telegram.ts    -- grammY bot: auth middleware, commands, prompt dispatch, streaming edits
  opencode.ts    -- SDK client wrapper: session CRUD, prompt, abort, permissions
  format.ts      -- MarkdownV2 escaping, code block preservation, tool summaries, message chunking
  events.ts      -- event router: message.part.updated, permission.asked, streaming dispatch
  memory.ts      -- exchange logging: saves every Telegram exchange as markdown to exchanges/
  log.ts         -- file-based logger (~/.local/share/clawcode/log/)
.opencode/
  skills/
    remember/SKILL.md  -- OpenCode skill: append user-specified memories to MEMORY.md
    recall/SKILL.md    -- OpenCode skill: search past exchanges via qmd
  agents/              -- custom agent definitions
  tools/               -- custom tool definitions
  commands/            -- custom slash commands
```

## Key Details

- Plugin receives `client` from OpenCode — no manual `createOpencodeClient` calls
- Plugin `event` hook replaces SSE subscription — no network layer for events
- No health check needed — plugin only loads when server is running
- Session-to-chat mapping persisted to `sessions.json` (resolved relative to `directory` from plugin context)
- Streaming uses edit-in-place with 2s throttle to stay under Telegram rate limits
- Prompt is fired non-blocking (`.then/.catch`) so grammY can process permission callbacks while waiting
- Permission requests surface as inline keyboards (Allow/Session/Deny)
- Permission callback data uses short counter keys (Telegram 64-byte limit on callback data)
- Message chunking respects code block boundaries at 4096 char Telegram limit
- Server sends `permission.asked` with a shape that diverges from the SDK's v1 `Permission` type.
  Local `PermissionEvent` interface in events.ts handles this. `event.type` cast to `string` to work around the Event union.
- `@opencode-ai/sdk` must be pinned to match the version bundled in `@opencode-ai/plugin` (type conflicts otherwise)
- Runtime: bun (no build step, plugin TS loaded directly by OpenCode)
- Every exchange is saved as `exchanges/YYYY-MM-DD-HHMMSS.md` (qmd-compatible markdown with YAML frontmatter)
- `/remember` sends a prompt to OpenCode that triggers the `remember` skill to append to `MEMORY.md`
- `recall` skill lets the model search past exchanges via qmd on demand
- Skills, agents, tools, and commands live in `.opencode/` in this repo, copied to `OPENCODE_WORKSPACE/.opencode/` via `make install`
- Bot shares a process with the OpenCode server — unhandled exceptions can crash the server. Keep error handling tight.

## Config

Config file `~/.config/opencode/clawcode.json`:

```json
{
  "token": "bot-token-here",
  "allowedUsers": [123456789]
}
```

- `token` -- required, Telegram bot API token
- `allowedUsers` -- required, array of allowed Telegram user IDs

Environment variables:

- `OPENCODE_WORKSPACE` -- optional, server working directory (used by Makefile at install time)
- `TELEGRAM_AUTOCONNECT` -- optional, set to `1` to auto-start the Telegram bot on plugin load (systemd unit sets this)
- `EXCHANGES_DIR` -- optional, exchange log directory (default `{directory}/exchanges`, where `directory` is the plugin context dir)

## Dev Flow

- Any functional change to the code MUST include corresponding updates to AGENTS.md and README.md (env vars, commands, architecture, key details, etc.)
- `make check` -- run lint + typecheck (always run before committing)
- `make lint` -- eslint
- `make typecheck` -- tsc --noEmit

## Deployment

Install the plugin into the OpenCode workspace's plugin directory (symlink or copy `src/main.ts`), or publish to npm and add to `opencode.json`.

`make install` -- installs `opencode-server.service` to `~/.config/systemd/user/`, copies `.opencode/` to `OPENCODE_WORKSPACE/.opencode/`.
`make uninstall` -- disable, remove, reload.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Integration | OpenCode plugin | Single process, no SSE, uses plugin-provided client and event hooks |
| Language | TypeScript | SDK/plugin API is JS/TS only |
| Telegram lib | grammY | Lightweight, TypeScript-native |
| Runtime | bun | No build step, runs TS directly |
| Bot mode | Long polling | Simpler than webhooks for single-user |
| Session mapping | File-persisted Map | Survives restarts |
| Deployment | systemd user service | Reliable, auto-restart, journald logging |
| Streaming | Edit-in-place messages | ChatGPT-style UX with 2s throttle |
| Prompt execution | Non-blocking `.then/.catch` | Avoids deadlock: grammY must process permission callbacks while prompt blocks |
