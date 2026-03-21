import type { Part } from "@opencode-ai/sdk/client";

const TELEGRAM_MAX = 4096;

// eslint-disable-next-line no-useless-escape
const MDVV2_SPECIAL = /[_*\[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMarkdownV2(text: string): string {
  return text.replace(MDVV2_SPECIAL, "\\$&");
}

/**
 * Escape text for MarkdownV2 but preserve code blocks (``` delimited).
 * Inside code blocks only ` and \ need escaping.
 */
function escapeWithCodeBlocks(text: string): string {
  const parts: string[] = [];
  let cursor = 0;

  // Match fenced code blocks: ```lang?\n...\n```
  const codeBlockRe = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRe.exec(text)) !== null) {
    // Escape text before this code block
    if (match.index > cursor) {
      parts.push(escapeMarkdownV2(text.slice(cursor, match.index)));
    }
    // Code blocks are passed through as-is — Telegram handles them natively
    parts.push(match[0]);
    cursor = match.index + match[0].length;
  }

  // Remaining text after last code block
  if (cursor < text.length) {
    parts.push(escapeMarkdownV2(text.slice(cursor)));
  }

  return parts.join("");
}

function formatToolPart(part: Extract<Part, { type: "tool" }>): string {
  const input = part.state.input;
  const target =
    (input["path"] as string | undefined) ??
    (input["filePath"] as string | undefined) ??
    (input["file"] as string | undefined) ??
    (input["command"] as string | undefined) ??
    "";
  const suffix = target ? ` \\(${escapeMarkdownV2(target)}\\)` : "";
  return `> Tool: ${escapeMarkdownV2(part.tool)}${suffix}`;
}

/** Extract formatted text from OpenCode Part[] response */
export function formatParts(parts: Part[]): string {
  const segments: string[] = [];

  for (const part of parts) {
    switch (part.type) {
      case "text":
        segments.push(escapeWithCodeBlocks(part.text));
        break;
      case "tool":
        segments.push(formatToolPart(part));
        break;
      // Other part types (step-start, step-finish, etc.) are ignored
    }
  }

  return segments.join("\n");
}

/**
 * Split a formatted message into chunks that fit within Telegram's 4096 char limit.
 * Respects code block boundaries — won't split inside a fenced block.
 */
export function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX) {
      chunks.push(remaining);
      break;
    }

    let splitAt = TELEGRAM_MAX;

    // Check if splitting here would land inside a code block
    const prefix = remaining.slice(0, splitAt);
    const backtickCount = countUnescapedTripleBackticks(prefix);

    if (backtickCount % 2 !== 0) {
      // We're inside a code block — find the closing ``` before the limit
      const lastClose = prefix.lastIndexOf("```");
      if (lastClose > 0) {
        splitAt = lastClose;
      }
      // If no closing found, we have an enormous code block — just split at limit
    }

    // Try to split at a newline for cleaner breaks
    const newline = remaining.lastIndexOf("\n", splitAt);
    if (newline > splitAt * 0.5) {
      splitAt = newline + 1;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  return chunks;
}

function countUnescapedTripleBackticks(text: string): number {
  let count = 0;
  let i = 0;
  while (i < text.length - 2) {
    if (text[i] === "`" && text[i + 1] === "`" && text[i + 2] === "`") {
      if (i === 0 || text[i - 1] !== "\\") {
        count++;
      }
      i += 3;
    } else {
      i++;
    }
  }
  return count;
}
