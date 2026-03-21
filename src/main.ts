import "dotenv/config";
import { healthCheck } from "./opencode.js";
import { subscribeEvents } from "./events.js";
import { createBot } from "./telegram.js";

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

const bot = createBot(token, allowedUsers);

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  bot.stop();
  console.log("clawcode bridge stopped.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("telegram bot starting long-polling...");
bot.start();
