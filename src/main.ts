import "dotenv/config";
import { healthCheck } from "./opencode.js";
import { subscribeEvents } from "./events.js";
import { createBot } from "./telegram.js";
import { initExchangesDir } from "./memory.js";

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

console.log("clawcode bridge starting...");

await healthCheck();
await subscribeEvents();
initExchangesDir();

const bot = createBot(token, allowedUsers);

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  bot.stop();
  console.log("clawcode bridge stopped.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

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

console.log("telegram bot starting long-polling...");
bot.start();
