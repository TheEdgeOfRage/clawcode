import type { Plugin } from "@opencode-ai/plugin";
import type { createOpencodeClient, Part } from "@opencode-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as log from "./log.js";
import { initExchangesDir, saveExchange } from "./memory.js";

interface Config {
  exchangesDir?: string;
}

function loadConfig(): Config {
  const configPath = join(homedir(), ".config", "opencode", "clawcode.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    const json = JSON.parse(raw) as Record<string, unknown>;
    const exchangesDir =
      typeof json.exchangesDir === "string" ? json.exchangesDir : undefined;
    return { exchangesDir };
  } catch {
    return {};
  }
}

type Client = ReturnType<typeof createOpencodeClient>;

function extractText(parts: Part[]): string {
  return parts
    .filter((p): p is Part & { type: "text" } => p.type === "text")
    .map((p) => (p as unknown as { text: string }).text)
    .join("\n");
}

async function saveLatestExchange(
  client: Client,
  sessionId: string,
  saved: Set<string>,
): Promise<void> {
  const result = await client.session.messages({
    path: { id: sessionId },
    query: { limit: 2 },
  });
  if (result.error || !result.data) return;

  let userText = "";
  let assistantText = "";
  let assistantId = "";

  for (const m of result.data) {
    if (m.info.role === "user") {
      userText = extractText(m.parts);
    } else if (m.info.role === "assistant") {
      assistantId = m.info.id;
      assistantText = extractText(m.parts);
    }
  }

  if (!assistantId || saved.has(assistantId)) return;
  if (!userText && !assistantText) return;

  saved.add(assistantId);
  saveExchange(userText, assistantText);
}

export const ClawCode: Plugin = async ({ client }) => {
  const config = loadConfig();
  initExchangesDir(config.exchangesDir);

  const saved = new Set<string>();

  return {
    event: async ({ event }) => {
      const type = event.type as string;
      if (type !== "session.idle") return;
      const sessionId = (
        event.properties as unknown as { sessionID: string }
      ).sessionID;
      try {
        await saveLatestExchange(client, sessionId, saved);
      } catch (err) {
        log.error("[exchange] save failed:", err);
      }
    },
  };
};
