# ClawCode

Telegram interface for [OpenCode](https://opencode.ai).

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

## Running

```bash
make install
systemctl --user enable --now opencode-server.service clawcode-bridge.service
```

To remove:

```bash
make uninstall
```

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Welcome message |
| `/new` | New session |
| `/sessions` | List and switch sessions |
| `/abort` | Abort current session |
| `/autoapprove on\|off` | Toggle auto-approve for permissions |
| `/history` | Recent messages from current session |
| `/start_llama` | Start llama systemd service |
| `/stop_llama` | Stop llama systemd service |

Send any text message to prompt OpenCode. Responses stream in real-time.
Permission requests appear as inline keyboards.
