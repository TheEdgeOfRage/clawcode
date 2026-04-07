import { spawn, execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { homedir } from "os";
import * as log from "./log.js";

let exchangesDir: string;
let indexing = false;

const DEFAULT_EXCHANGES_DIR = join(
  process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
  "opencode",
  "exchanges",
);

export function initExchangesDir(override?: string): void {
  exchangesDir = resolve(override || DEFAULT_EXCHANGES_DIR);
  if (!existsSync(exchangesDir)) {
    mkdirSync(exchangesDir, { recursive: true });
    log.info(`[memory] created exchanges dir: ${exchangesDir}`);
  }
}

function qmdIndex(): void {
  if (indexing) return;

  try {
    execSync("command -v qmd", { stdio: "ignore" });
  } catch {
    return;
  }

  indexing = true;
  const child = spawn("sh", ["-c", "qmd update && qmd embed"], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  child.on("close", (code) => {
    indexing = false;
    if (code !== 0) log.error(`[memory] qmd index exited with code ${code}`);
  });
  child.on("error", (err) => {
    indexing = false;
    log.error("[memory] qmd index failed", err);
  });
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
  qmdIndex();
}
