# ClawCode

Telegram bot bridge to an OpenCode server. TypeScript, grammY, `@opencode-ai/sdk`.

## Architecture

Two processes:
- **OpenCode server** (`opencode serve --port 4096`) -- systemd unit `opencode-server.service`
- **Bridge** (`bun run src/main.ts`) -- systemd unit `clawcode-bridge.service`, depends on server

```
Telegram <-> Bridge <-> OpenCode Server
```

## Source Layout

```
src/
  main.ts        -- entry point: env validation, health check, event subscribe, bot start
  telegram.ts    -- grammY bot: auth middleware, commands, prompt dispatch, streaming edits
  opencode.ts    -- SDK client wrapper: session CRUD, prompt, abort, permissions, auto-approve
  format.ts      -- MarkdownV2 escaping, code block preservation, tool summaries, message chunking
  events.ts      -- SSE subscription: message.part.updated, permission.asked, streaming dispatch
  memory.ts      -- exchange logging: saves every Telegram exchange as markdown to exchanges/
  types.ts       -- shared types (unused, stale)
skills/
  remember/SKILL.md  -- OpenCode skill: append user-specified memories to MEMORY.md
  recall/SKILL.md    -- OpenCode skill: search past exchanges via qmd
```

## Key Details

- Two separate `createOpencodeClient` instances (opencode.ts for requests, events.ts for SSE stream)
- Session-to-chat mapping persisted to `sessions.json` (loaded on startup, saved on change)
- Streaming uses edit-in-place with 2s throttle to stay under Telegram rate limits
- Prompt is fired non-blocking (`.then/.catch`) so grammY can process permission callbacks while waiting
- Permission requests surface as inline keyboards (Allow/Session/Deny); auto-approve is per-session toggle
- Permission callback data uses short counter keys (Telegram 64-byte limit on callback data)
- Message chunking respects code block boundaries at 4096 char Telegram limit
- SSE event types diverge from SDK types: server sends `permission.asked` (not `permission.updated`),
  with different property shapes. Custom `PermissionEvent` interface in events.ts handles this.
- No SSE reconnection logic; relies on systemd `Restart=on-failure` for recovery
- Runtime: bun (no build step)
- Every exchange is saved as `exchanges/YYYY-MM-DD-HHMMSS.md` (qmd-compatible markdown with YAML frontmatter)
- `/remember` sends a prompt to OpenCode that triggers the `remember` skill to append to `MEMORY.md`
- `recall` skill lets the model search past exchanges via qmd on demand
- Skills live in `skills/` in this repo, installed to `OPENCODE_WORKSPACE/.opencode/skills/` via `make install`

## Config

`.env` file:
- `TELEGRAM_BOT_TOKEN` -- required
- `TELEGRAM_ALLOWED_USERS` -- required, comma-separated Telegram user IDs
- `OPENCODE_URL` -- optional, default `http://127.0.0.1:4096`
- `OPENCODE_WORKSPACE` -- optional, server working directory (used by Makefile at install time)
- `EXCHANGES_DIR` -- optional, exchange log directory (default `./exchanges`)

## Dev Flow

- `make check` -- run lint + typecheck (always run before committing)
- `make lint` -- eslint
- `make typecheck` -- tsc --noEmit

## Deployment

`make install` -- sed-substitutes `{{WORKDIR}}` in service files and copies to `~/.config/systemd/user/`, reload daemon. Server WorkingDirectory comes from `OPENCODE_WORKSPACE` in `.env` (falls back to cwd). Also installs skills to `OPENCODE_WORKSPACE/.opencode/skills/`.
`make uninstall` -- disable, remove, reload.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript | SDK is JS/TS only; no Go SDK exists |
| Telegram lib | grammY | Lightweight, TypeScript-native |
| Runtime | bun | No build step, runs TS directly |
| Bot mode | Long polling | Simpler than webhooks for single-user |
| Session mapping | File-persisted Map | Survives restarts; auto-approve is in-memory only |
| Deployment | systemd user services | Reliable, auto-restart, journald logging |
| Streaming | Edit-in-place messages | ChatGPT-style UX with 2s throttle |
| Prompt execution | Non-blocking `.then/.catch` | Avoids deadlock: grammY must process permission callbacks while prompt blocks |
