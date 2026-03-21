/** Mapping from Telegram chat ID to OpenCode session ID */
export type ChatSessionMap = Map<number, string>;

export interface BridgeConfig {
  telegramBotToken: string;
  allowedUsers: number[];
  openCodeUrl: string;
}

export interface SessionInfo {
  id: string;
  title?: string;
  createdAt: string;
}
