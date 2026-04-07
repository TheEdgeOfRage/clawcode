# ClawCode

OpenCode plugin for exchange logging and workspace configuration (skills, agents, commands, tools). TypeScript, `@opencode-ai/plugin`.

The Telegram bridge lives in a separate project: [opencode-telegram](https://github.com/pavle/opencode-telegram).

## Architecture

Single process — the plugin runs inside the OpenCode server. It hooks into server events to capture every session exchange as qmd-compatible markdown files.

```
OpenCode Server -> Plugin (event hook) -> Exchange Logger -> exchanges/*.md
```

## Source Layout

```
src/
  main.ts        -- plugin entry: config, event hook for session.idle, exchange capture
  memory.ts      -- exchange logging: saves exchanges as markdown with YAML frontmatter, qmd indexing
  log.ts         -- file-based logger (~/.local/share/clawcode/log/)
opencode/
  skills/
    remember/SKILL.md  -- OpenCode skill: append user-specified memories to MEMORY.md
    recall/SKILL.md    -- OpenCode skill: search past exchanges via qmd
  agents/
    research.md        -- Research agent: web search + fetch
  tools/
    websearch.ts       -- Brave Search API tool
  commands/
    telegram.md        -- /telegram command: delegates to telegram tool
```

## Key Details

- Plugin receives `client` from OpenCode — no manual `createOpencodeClient` calls
- Plugin `event` hook listens for `session.idle` to detect completed exchanges
- On `session.idle`, fetches the last 2 messages via `client.session.messages()` and saves the user/assistant pair
- Tracks saved assistant message IDs to avoid duplicate exchange logging
- `event.type` cast to `string` to work around the Event union type
- `@opencode-ai/sdk` must be pinned to match the version bundled in `@opencode-ai/plugin` (type conflicts otherwise)
- Runtime: bun (no build step, plugin TS loaded directly by OpenCode)
- Every exchange is saved as `exchanges/YYYY-MM-DD-HHMMSS.md` (qmd-compatible markdown with YAML frontmatter)
- `recall` skill lets the model search past exchanges via qmd on demand
- Skills, agents, tools, and commands live in `opencode/` in this repo, copied to `OPENCODE_WORKSPACE/.opencode/` via `install.sh`
- Plugin shares a process with the OpenCode server — unhandled exceptions can crash the server. Keep error handling tight.
- Config file is optional — plugin works with defaults if no config file exists

## Config

Config file `~/.config/opencode/clawcode.json`:

```json
{
  "exchangesDir": "/custom/path/to/exchanges"
}
```

- `exchangesDir` -- optional, exchange log directory (default `$XDG_DATA_HOME/opencode/exchanges`, falls back to `~/.local/share/opencode/exchanges`)

Environment variables:

- `OPENCODE_WORKSPACE` -- optional, server working directory (used by install.sh)
## Dev Flow

- Any functional change to the code MUST include corresponding updates to AGENTS.md and README.md (env vars, commands, architecture, key details, etc.)
- `make check` -- run lint + typecheck (always run before committing)
- `make lint` -- eslint
- `make typecheck` -- tsc --noEmit

## Deployment

`install.sh install` -- copies `opencode/` to `OPENCODE_WORKSPACE/.opencode/`, symlinks clawcode plugin, installs systemd service.
`install.sh uninstall` -- disable service, remove symlinks.

## Key Decisions

| Decision          | Choice              | Rationale                                                           |
| ----------------- | ------------------- | ------------------------------------------------------------------- |
| Integration       | OpenCode plugin     | Single process, uses plugin-provided client and event hooks         |
| Language          | TypeScript          | SDK/plugin API is JS/TS only                                        |
| Runtime           | bun                 | No build step, runs TS directly                                     |
| Exchange capture  | session.idle event  | Fires when session completes, fetch last messages via SDK client    |
| Exchange format   | Markdown + YAML FM  | Compatible with qmd for semantic search                             |
| Deployment        | systemd user service| Reliable, auto-restart, journald logging                            |
