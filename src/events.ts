import { createOpencodeClient, type Event, type Part, type Permission } from "@opencode-ai/sdk/client";

const OPENCODE_URL = process.env.OPENCODE_URL || "http://127.0.0.1:4096";

const sseClient = createOpencodeClient({ baseUrl: OPENCODE_URL });

export type PartHandler = (parts: Part[]) => void;
export type ErrorHandler = (error: string) => void;
export type DoneHandler = (parts: Part[]) => void;
export type PermissionHandler = (permission: Permission) => void;

interface SessionHandler {
  onPart: PartHandler;
  onError: ErrorHandler;
  onDone: DoneHandler;
  onPermission?: PermissionHandler;
  parts: Map<string, Part>;
}

const handlers = new Map<string, SessionHandler>();

export function registerSession(
  sessionId: string,
  onPart: PartHandler,
  onError: ErrorHandler,
  onDone: DoneHandler,
  onPermission?: PermissionHandler,
): void {
  handlers.set(sessionId, { onPart, onError, onDone, onPermission, parts: new Map() });
}

export function unregisterSession(sessionId: string): void {
  handlers.delete(sessionId);
}

export function isSessionRegistered(sessionId: string): boolean {
  return handlers.has(sessionId);
}

function handleEvent(event: Event): void {
  switch (event.type) {
    case "message.part.updated": {
      const part = event.properties.part;
      const handler = handlers.get(part.sessionID);
      if (!handler) return;
      handler.parts.set(part.id, part);
      handler.onPart(Array.from(handler.parts.values()));
      break;
    }
    case "session.error": {
      const sessionId = event.properties.sessionID;
      if (!sessionId) return;
      const handler = handlers.get(sessionId);
      if (!handler) return;
      const err = event.properties.error;
      const errMsg = err
        ? ("message" in err.data
            ? String(err.data.message)
            : err.name)
        : "Unknown error";
      handler.onError(String(errMsg));
      handlers.delete(sessionId);
      break;
    }
    case "session.idle": {
      const sessionId = event.properties.sessionID;
      const handler = handlers.get(sessionId);
      if (!handler) return;
      handler.onDone(Array.from(handler.parts.values()));
      handlers.delete(sessionId);
      break;
    }
    case "permission.updated": {
      const permission = event.properties;
      const handler = handlers.get(permission.sessionID);
      if (!handler?.onPermission) return;
      handler.onPermission(permission);
      break;
    }
  }
}

export async function subscribeEvents(): Promise<void> {
  const { stream } = await sseClient.event.subscribe();
  // Run event loop in background — never awaited to completion
  void (async () => {
    for await (const event of stream) {
      try {
        handleEvent(event);
      } catch (err) {
        console.error("event handler error:", err);
      }
    }
  })();
  console.log("SSE event stream connected");
}
