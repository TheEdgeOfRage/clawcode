import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";

const EXCHANGES_DIR = resolve(process.env.EXCHANGES_DIR || "./exchanges");

export function initExchangesDir(): void {
  if (!existsSync(EXCHANGES_DIR)) {
    mkdirSync(EXCHANGES_DIR, { recursive: true });
    console.log(`[memory] created exchanges dir: ${EXCHANGES_DIR}`);
  }
}

export function saveExchange(userMessage: string, assistantResponse: string): void {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const filename = `${date}-${time}.md`;
  const filepath = join(EXCHANGES_DIR, filename);

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
  console.log(`[memory] saved exchange: ${filename}`);
}
