import type { createOpencodeClient, Part } from "@opencode-ai/sdk";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

type Client = ReturnType<typeof createOpencodeClient>;

let client: Client;
let sessionsFile: string;

const chatSessions = new Map<number, string>();

export function init(c: Client, directory: string): void {
  client = c;
  sessionsFile = resolve(directory, "sessions.json");
  loadSessions();
}

function loadSessions(): void {
  try {
    const raw = readFileSync(sessionsFile, "utf8");
    const obj = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(obj)) chatSessions.set(Number(k), v);
  } catch {
    // no file or invalid — start fresh
  }
}

function saveSessions(): void {
  const obj: Record<string, string> = {};
  for (const [k, v] of chatSessions) obj[String(k)] = v;
  writeFileSync(sessionsFile, JSON.stringify(obj, null, 2));
}

export async function getOrCreateSession(
  chatId: number,
): Promise<{ sessionId: string; fallback: boolean }> {
  const existing = chatSessions.get(chatId);
  if (existing) {
    const list = await client.session.list();
    if (!list.error && list.data?.some((s) => s.id === existing)) {
      return { sessionId: existing, fallback: false };
    }
  }

  const result = await client.session.create();
  if (result.error) throw new Error(`failed to create session: ${result.error}`);

  const sessionId = result.data.id;
  chatSessions.set(chatId, sessionId);
  saveSessions();
  return { sessionId, fallback: existing !== undefined };
}

export async function sendPrompt(
  sessionId: string,
  text: string,
): Promise<Part[]> {
  const result = await client.session.prompt({
    path: { id: sessionId },
    body: { parts: [{ type: "text", text }] },
  });
  if (result.error) throw new Error(`prompt failed: ${JSON.stringify(result.error)}`);

  return result.data.parts;
}

export async function createNewSession(chatId: number): Promise<string> {
  const result = await client.session.create();
  if (result.error) throw new Error(`failed to create session: ${result.error}`);

  const sessionId = result.data.id;
  chatSessions.set(chatId, sessionId);
  saveSessions();
  return sessionId;
}

export async function listSessions(): Promise<
  Array<{ id: string; title: string; created: number }>
> {
  const result = await client.session.list();
  if (result.error) throw new Error(`list sessions failed: ${result.error}`);
  if (!result.data) return [];

  return result.data.map((s) => ({
    id: s.id,
    title: s.title,
    created: s.time.created,
  }));
}

export function getSessionId(chatId: number): string | undefined {
  return chatSessions.get(chatId);
}

export function switchSession(chatId: number, sessionId: string): void {
  chatSessions.set(chatId, sessionId);
  saveSessions();
}

export async function getSessionMessages(
  sessionId: string,
  limit = 10,
): Promise<Array<{ role: string; parts: Part[] }>> {
  const result = await client.session.messages({
    path: { id: sessionId },
    query: { limit },
  });
  if (result.error) throw new Error(`list messages failed: ${JSON.stringify(result.error)}`);
  if (!result.data) return [];

  return result.data.map((m) => ({
    role: m.info.role,
    parts: m.parts,
  }));
}

export async function abortSession(sessionId: string): Promise<void> {
  const result = await client.session.abort({
    path: { id: sessionId },
  });
  if (result.error) throw new Error(`abort failed: ${JSON.stringify(result.error)}`);
}

export async function replyPermission(
  sessionId: string,
  permissionId: string,
  response: "once" | "always" | "reject",
): Promise<void> {
  const result = await client.postSessionIdPermissionsPermissionId({
    path: { id: sessionId, permissionID: permissionId },
    body: { response },
  });
  if (result.error) throw new Error(`permission reply failed: ${JSON.stringify(result.error)}`);
}
