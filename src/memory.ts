import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import * as log from "./log.js";

let exchangesDir: string;

export function initExchangesDir(directory: string): void {
  exchangesDir = resolve(process.env.EXCHANGES_DIR || join(directory, "exchanges"));
  if (!existsSync(exchangesDir)) {
    mkdirSync(exchangesDir, { recursive: true });
    log.info(`[memory] created exchanges dir: ${exchangesDir}`);
  }
}

export function saveExchange(userMessage: string, assistantResponse: string): void {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const filename = `${date}-${time}.md`;
  const filepath = join(exchangesDir, filename);

  const content = [
    "---",
    `date: ${now.toISOString()}`,
    "---",
    "",
    "## User",
    "",
    userMessage,
    "",
    "## Assistant",
    "",
    assistantResponse,
    "",
  ].join("\n");

  writeFileSync(filepath, content);
  log.info(`[memory] saved exchange: ${filename}`);
}
