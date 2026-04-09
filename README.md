# ClawCode

OpenCode plugin for exchange logging and workspace configuration (skills, agents, commands, tools).

## Prerequisites

- [OpenCode](https://opencode.ai) installed
- [Bun](https://bun.sh)
- [qmd](https://github.com/qmd-project/qmd)

## Setup

```bash
bun install
```

Optionally create `~/.config/opencode/clawcode.json` to override the exchanges directory:

```json
{
  "exchangesDir": "/custom/path/to/exchanges"
}
```

Default: `$XDG_DATA_HOME/opencode/exchanges` (falls back to `~/.local/share/opencode/exchanges`).

## Install

```bash
./install.sh install
systemctl --user enable --now opencode-server.service
```

This copies skills, agents, tools, and commands to `$OPENCODE_WORKSPACE/.opencode/`, symlinks the plugin, and installs the systemd service.

To remove:

```bash
./install.sh uninstall
```

## Exchange Logging

Every completed session exchange is automatically saved as qmd-compatible markdown to the exchanges directory. The plugin listens for `session.idle` events and captures the last user/assistant message pair.

The install script sets up a qmd collection for semantic search. New exchanges are automatically indexed after each save.

## Telegram Bridge

For Telegram integration, see [opencode-telegram](https://github.com/TheEdgeOfRage/opencode-telegram).
