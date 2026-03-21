import { createOpencodeClient, type Part } from "@opencode-ai/sdk/client";
import { formatParts, splitMessage } from "./format.js";

const OPENCODE_URL = process.env.OPENCODE_URL || "http://127.0.0.1:4096";

const client = createOpencodeClient({ baseUrl: OPENCODE_URL });

const chatSessions = new Map<number, string>();
const autoApprove = new Set<string>();

export function setAutoApprove(sessionId: string, enabled: boolean): void {
  if (enabled) autoApprove.add(sessionId);
  else autoApprove.delete(sessionId);
}

export function isAutoApprove(sessionId: string): boolean {
  return autoApprove.has(sessionId);
}

export async function healthCheck(
  maxRetries = 10,
  baseDelayMs = 500,
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await client.session.list();
      if (result.response.ok) {
        console.log(`opencode server ready at ${OPENCODE_URL}`);
        return;
      }
    } catch {
      // server not up yet
    }
    const delay = baseDelayMs * 2 ** attempt;
    console.log(
      `opencode not ready, retrying in ${delay}ms (${attempt + 1}/${maxRetries})`,
    );
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error(
    `opencode server at ${OPENCODE_URL} not reachable after ${maxRetries} retries`,
  );
}

export async function getOrCreateSession(chatId: number): Promise<string> {
  const existing = chatSessions.get(chatId);
  if (existing) return existing;

  const result = await client.session.create();
  if (result.error) throw new Error(`failed to create session: ${result.error}`);

  const sessionId = result.data.id;
  chatSessions.set(chatId, sessionId);
  return sessionId;
}

export async function sendPrompt(
  sessionId: string,
  text: string,
): Promise<string[]> {
  const result = await client.session.prompt({
    path: { id: sessionId },
    body: { parts: [{ type: "text", text }] },
  });
  if (result.error) throw new Error(`prompt failed: ${JSON.stringify(result.error)}`);

  const formatted = formatParts(result.data.parts);
  return splitMessage(formatted);
}

export async function createNewSession(chatId: number): Promise<string> {
  const result = await client.session.create();
  if (result.error) throw new Error(`failed to create session: ${result.error}`);

  const sessionId = result.data.id;
  chatSessions.set(chatId, sessionId);
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
