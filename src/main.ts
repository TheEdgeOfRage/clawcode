import type { Plugin } from "@opencode-ai/plugin";
import * as log from "./log.js";
import { init } from "./opencode.js";
import { handleEvent } from "./events.js";
import { createBot } from "./telegram.js";
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

  const bot = createBot(token, allowedUsers);

  await bot.api.setMyCommands([
    { command: "start", description: "Welcome message" },
    { command: "new", description: "New session" },
    { command: "sessions", description: "List and switch sessions" },
    { command: "abort", description: "Abort current session" },
    { command: "autoapprove", description: "Toggle auto-approve (on|off)" },
    { command: "history", description: "Recent messages from current session" },
    { command: "remember", description: "Save a memory (/remember <text>)" },
    { command: "start_llama", description: "Start llama service" },
    { command: "stop_llama", description: "Stop llama service" },
  ]);

  log.info("telegram bot starting long-polling...");
  bot.start();

  return {
    event: async ({ event }) => {
      try {
        handleEvent(event);
      } catch (err) {
        log.error("event handler error:", err);
      }
    },
  };
};
