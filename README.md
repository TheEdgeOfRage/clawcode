# CodeClaw

Telegram interface for [OpenCode](https://opencode.ai), implemented as an OpenCode plugin.

## Prerequisites

- [OpenCode](https://opencode.ai) installed
- [Bun](https://bun.sh)
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your Telegram user ID from [@userinfobot](https://t.me/userinfobot)

## Setup

```bash
bun install
cp .env.example .env
# Edit .env with your bot token and allowed user IDs
```

## Install

Symlink the plugin into your OpenCode workspace:

```bash
mkdir -p /path/to/workspace/.opencode/plugins
ln -s /path/to/clawcode/src/main.ts /path/to/workspace/.opencode/plugins/clawcode.ts
```

Or use the Makefile to install the systemd service, plugin, and `.opencode/` assets:

```bash
make install
systemctl --user enable --now opencode-server.service
```

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_USERS` in the server's environment (e.g., `EnvironmentFile=` in the systemd unit).

The Telegram bot is **on-demand** by default. Use `/telegram connect` in the OpenCode TUI to start it. The systemd unit sets `TELEGRAM_AUTOCONNECT=1` to auto-start.

To remove:

```bash
make uninstall
```

## Bot Commands

| Command | Description |
|---|---|
| `/new` | New session |
| `/sessions` | List and switch sessions |
| `/abort` | Abort current session |
| `/history` | Recent messages from current session |
| `/agent <name>` | Switch agent (omit name to list available) |
| `/remember <text>` | Save a memory to MEMORY.md via OpenCode |
| `/start_llama` | Start llama systemd service |
| `/stop_llama` | Stop llama systemd service |

Send any text message to prompt OpenCode. Responses stream in real-time.
Permission requests appear as inline keyboards.

## Memory System

Every exchange is automatically saved to `exchanges/` as qmd-compatible markdown.

- `/remember <text>` — tells OpenCode to append a memory to `MEMORY.md` in the workspace (always read on startup)
- The `recall` skill lets the model search past exchanges via qmd on demand

### qmd Setup

After first run, create a qmd collection for the exchanges:

```bash
qmd collection add /path/to/exchanges --name exchanges --mask "**/*.md"
qmd embed
```

New exchanges are automatically indexed via `qmd update && qmd embed` after each save (if `qmd` is installed).
