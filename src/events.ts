import { createOpencodeClient, type Event, type EventMessageUpdated, type EventMessagePartUpdated, type Part } from "@opencode-ai/sdk/client";

const OPENCODE_URL = process.env.OPENCODE_URL || "http://127.0.0.1:4096";

const sseClient = createOpencodeClient({ baseUrl: OPENCODE_URL });

// Actual shape from the server (differs from SDK's Permission type)
export interface PermissionEvent {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always?: string[];
  tool?: { messageID: string; callID: string };
}

export type PartHandler = (parts: Part[]) => void;
export type PermissionHandler = (perm: PermissionEvent) => void;

interface SessionHandler {
  onPart: PartHandler;
  onPermission: PermissionHandler;
  parts: Map<string, Part>;
  assistantMessageIDs: Set<string>;
}

const handlers = new Map<string, SessionHandler>();

export function registerSession(
  sessionId: string,
  onPart: PartHandler,
  onPermission: PermissionHandler,
): void {
  handlers.set(sessionId, { onPart, onPermission, parts: new Map(), assistantMessageIDs: new Set() });
}

export function unregisterSession(sessionId: string): void {
  handlers.delete(sessionId);
}

function handleEvent(event: Event): void {
  const type = event.type as string;

  if (type === "message.updated") {
    const info = (event as EventMessageUpdated).properties.info;
    if (info.role !== "assistant") return;
    const handler = handlers.get(info.sessionID);
    if (!handler) return;
    handler.assistantMessageIDs.add(info.id);
    return;
  }

  if (type === "message.part.updated") {
    const part = (event as EventMessagePartUpdated).properties.part;
    const handler = handlers.get(part.sessionID);
    if (!handler) return;
    if (!handler.assistantMessageIDs.has(part.messageID)) return;
    handler.parts.set(part.id, part);
    handler.onPart(Array.from(handler.parts.values()));
    return;
  }

  if (type === "permission.asked" || type === "permission.updated") {
    const perm = event.properties as unknown as PermissionEvent;
    console.log(`[events] ${type} session=${perm.sessionID} perm=${perm.id} permission=${perm.permission}`);
    const handler = handlers.get(perm.sessionID);
    if (!handler) return;
    handler.onPermission(perm);
    return;
  }
}

export async function subscribeEvents(): Promise<void> {
  const { stream } = await sseClient.event.subscribe();
  void (async () => {
    for await (const event of stream) {
      try {
        handleEvent(event);
      } catch (err) {
        console.error("[events] handler error:", err);
      }
    }
    console.error("[events] SSE stream ended unexpectedly");
  })();
  console.log("[events] SSE stream connected");
}
