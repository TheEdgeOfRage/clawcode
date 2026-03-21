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
  events.ts      -- SSE subscription: message.part.updated, session.error/idle, permission.updated
  types.ts       -- shared types (currently unused)
```

## Key Details

- Two separate `createOpencodeClient` instances (opencode.ts for requests, events.ts for SSE stream)
- Session-to-chat mapping is in-memory `Map<number, string>`; lost on restart
- Streaming uses edit-in-place with 2s throttle to stay under Telegram rate limits
- Permission requests surface as inline keyboards; auto-approve is per-session toggle
- Message chunking respects code block boundaries at 4096 char Telegram limit
- Runtime: bun (no build step)

## Config

`.env` file with `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS`, optional `OPENCODE_URL`.

## Dev Flow

- `make check` -- run lint + typecheck (always run before committing)
- `make lint` -- eslint
- `make typecheck` -- tsc --noEmit

## Deployment

`make install` -- copy service files to `~/.config/systemd/user/`, reload daemon.
`make uninstall` -- disable, remove, reload.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript | SDK is JS/TS only; no Go SDK exists |
| Telegram lib | grammY | Lightweight, TypeScript-native |
| Runtime | bun | No build step, runs TS directly |
| Bot mode | Long polling | Simpler than webhooks for single-user |
| Session mapping | In-memory Map | Sufficient for single-user; lost on restart = minor |
| Deployment | systemd user services | Reliable, auto-restart, journald logging |
| Streaming | Edit-in-place messages | ChatGPT-style UX with 2s throttle |
