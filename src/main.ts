import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import type { Bot } from "grammy";
import * as log from "./log.js";
import { init, setAttachedSession, clearAttachedSession } from "./opencode.js";
import { handleEvent } from "./events.js";
import { BOT_COMMANDS, createBot } from "./telegram.js";
import { initExchangesDir } from "./memory.js";

export const ClawCode: Plugin = async ({ client, directory }) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

  const allowedUsers = (process.env.TELEGRAM_ALLOWED_USERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);

  if (allowedUsers.length === 0) {
    throw new Error("TELEGRAM_ALLOWED_USERS must contain at least one user ID");
  }

  init(client, directory);
  initExchangesDir(directory);

  let bot: Bot | null = null;
  const autoConnect = process.env.TELEGRAM_AUTOCONNECT === "1";

  async function connect(): Promise<string> {
    if (bot) return "already connected";
    bot = createBot(token!, allowedUsers);
    await bot.api.setMyCommands(BOT_COMMANDS);
    log.info("telegram bot starting long-polling...");
    bot.start();
    return "connected";
  }

  async function disconnect(): Promise<string> {
    if (!bot) return "not connected";
    await bot.stop();
    bot = null;
    clearAttachedSession();
    log.info("telegram bot stopped");
    return "disconnected";
  }

  if (autoConnect) {
    connect().catch((err) => log.error("autoconnect failed:", err));
  }

  return {
    event: async ({ event }) => {
      try {
        handleEvent(event);
      } catch (err) {
        log.error("event handler error:", err);
      }
    },
    tool: {
      telegram: tool({
        description:
          "Connect or disconnect the Telegram bot. Actions: connect, disconnect, status.",
        args: {
          action: tool.schema.enum(["connect", "disconnect", "status"]),
        },
        async execute(args, context) {
          if (args.action === "connect") {
            setAttachedSession(context.sessionID);
            return connect();
          }
          if (args.action === "disconnect") return disconnect();
          return bot ? "connected" : "disconnected";
        },
      }),
    },
  };
};
