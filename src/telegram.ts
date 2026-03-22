import { spawnSync } from "node:child_process";
import { Bot, InlineKeyboard, type Context } from "grammy";
import type { Part, Permission } from "@opencode-ai/sdk/client";
import { escapeMarkdownV2, formatParts, splitMessage } from "./format.js";
import {
  getOrCreateSession,
  createNewSession,
  listSessions,
  getSessionId,
  switchSession,
  getSessionMessages,
  abortSession,
  sendPrompt,
  replyPermission,
  setAutoApprove,
  isAutoApprove,
} from "./opencode.js";
import { registerSession, unregisterSession, isSessionRegistered } from "./events.js";

const THROTTLE_MS = 2000;

function formatPartsPreview(parts: Part[]): string {
  const text = formatParts(parts);
  if (!text) return escapeMarkdownV2("thinking...");
  // Truncate to fit Telegram's 4096 limit for edits
  if (text.length > 4000) return text.slice(0, 4000) + escapeMarkdownV2("...");
  return text;
}

async function editMessage(
  ctx: Context,
  messageId: number,
  text: string,
): Promise<void> {
  try {
    await ctx.api.editMessageText(ctx.chat!.id, messageId, text, {
      parse_mode: "MarkdownV2",
    });
  } catch {
    // Edit may fail if text unchanged or message deleted — ignore
  }
}

function formatPermissionMessage(perm: Permission): string {
  const lines = [
    escapeMarkdownV2(`Permission request: ${perm.type}`),
    escapeMarkdownV2(`Title: ${perm.title}`),
  ];
  if (perm.pattern) {
    const patterns = Array.isArray(perm.pattern) ? perm.pattern.join(", ") : perm.pattern;
    lines.push(escapeMarkdownV2(`Pattern: ${patterns}`));
  }
  const metaEntries = Object.entries(perm.metadata);
  if (metaEntries.length > 0) {
    const meta = metaEntries
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(", ");
    lines.push(escapeMarkdownV2(`Metadata: ${meta}`));
  }
  return lines.join("\n");
}

export function createBot(token: string, allowedUsers: number[]): Bot {
  const bot = new Bot(token);

  const allowed = new Set(allowedUsers);

  // Auth middleware — reject users not in allowlist
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !allowed.has(userId)) {
      await ctx.reply("Not authorized.");
      return;
    }
    await next();
  });

  bot.command("start_llama", async (ctx) => {
    try {
      const proc = spawnSync("systemctl", ["--user", "start", "llama"]);
      if (proc.status === 0) {
        await ctx.reply("llama started\\.", { parse_mode: "MarkdownV2" });
      } else {
        await ctx.reply(`Failed to start llama: ${proc.stderr?.toString().trim()}`);
      }
    } catch (err) {
      await ctx.reply(`Error: ${String(err)}`);
    }
  });

  bot.command("stop_llama", async (ctx) => {
    try {
      const proc = spawnSync("systemctl", ["--user", "stop", "llama"]);
      if (proc.status === 0) {
        await ctx.reply("llama stopped\\.", { parse_mode: "MarkdownV2" });
      } else {
        await ctx.reply(`Failed to stop llama: ${proc.stderr?.toString().trim()}`);
      }
    } catch (err) {
      await ctx.reply(`Error: ${String(err)}`);
    }
  });

  bot.command("start", async (ctx) => {
    const sessionId = getSessionId(ctx.chat.id);
    const autoApproveStatus = sessionId && isAutoApprove(sessionId) ? "on" : "off";
    await ctx.reply(
      `Welcome to ClawCode\\! Send me a message and I'll forward it to OpenCode\\.\n\nAuto\\-approve: *${autoApproveStatus}*`,
      { parse_mode: "MarkdownV2" },
    );
  });

  bot.command("new", async (ctx) => {
    const chatId = ctx.chat.id;
    try {
      const sessionId = await createNewSession(chatId);
      await ctx.reply(`New session created: \`${escapeMarkdownV2(sessionId)}\``, {
        parse_mode: "MarkdownV2",
      });
    } catch (err) {
      await ctx.reply(`Failed to create session: ${String(err)}`);
    }
  });

  bot.command("sessions", async (ctx) => {
    try {
      const sessions = await listSessions();
      if (sessions.length === 0) {
        await ctx.reply("No sessions found\\.", { parse_mode: "MarkdownV2" });
        return;
      }

      const currentId = getSessionId(ctx.chat.id);
      const lines = sessions.map((s) => {
        const marker = s.id === currentId ? " \\(active\\)" : "";
        const title = escapeMarkdownV2(s.title || "untitled");
        const id = escapeMarkdownV2(s.id.slice(0, 8));
        return `• \`${id}\` ${title}${marker}`;
      });

      const keyboard = new InlineKeyboard();
      for (const s of sessions) {
        if (s.id === currentId) continue;
        const label = (s.title || "untitled").slice(0, 30);
        keyboard.text(label, `switch:${s.id}`).row();
      }

      await ctx.reply(lines.join("\n"), {
        parse_mode: "MarkdownV2",
        reply_markup: keyboard.inline_keyboard.length > 0 ? keyboard : undefined,
      });
    } catch (err) {
      await ctx.reply(`Failed to list sessions: ${String(err)}`);
    }
  });

  bot.command("abort", async (ctx) => {
    const sessionId = getSessionId(ctx.chat.id);
    if (!sessionId) {
      await ctx.reply("No active session to abort.");
      return;
    }
    try {
      await abortSession(sessionId);
      await ctx.reply("Session aborted\\.", { parse_mode: "MarkdownV2" });
    } catch (err) {
      await ctx.reply(`Failed to abort: ${String(err)}`);
    }
  });

  bot.command("autoapprove", async (ctx) => {
    const arg = ctx.match?.trim().toLowerCase();
    if (arg !== "on" && arg !== "off") {
      await ctx.reply("Usage: /autoapprove on \\| off", { parse_mode: "MarkdownV2" });
      return;
    }
    const sessionId = getSessionId(ctx.chat.id);
    if (!sessionId) {
      await ctx.reply("No active session\\. Use /new to create one\\.", {
        parse_mode: "MarkdownV2",
      });
      return;
    }
    const enabled = arg === "on";
    setAutoApprove(sessionId, enabled);
    await ctx.reply(
      escapeMarkdownV2(`Auto-approve ${enabled ? "enabled" : "disabled"} for current session.`),
      { parse_mode: "MarkdownV2" },
    );
  });

  bot.command("history", async (ctx) => {
    const sessionId = getSessionId(ctx.chat.id);
    if (!sessionId) {
      await ctx.reply("No active session\\. Use /new to create one\\.", {
        parse_mode: "MarkdownV2",
      });
      return;
    }
    try {
      const messages = await getSessionMessages(sessionId);
      if (messages.length === 0) {
        await ctx.reply("No messages in this session\\.", {
          parse_mode: "MarkdownV2",
        });
        return;
      }

      const lines: string[] = [];
      for (const msg of messages) {
        const role = msg.role === "user" ? "You" : "Assistant";
        const text = formatParts(msg.parts);
        const preview = text
          ? text.slice(0, 200) + (text.length > 200 ? escapeMarkdownV2("...") : "")
          : escapeMarkdownV2("(no text)");
        lines.push(`*${escapeMarkdownV2(role)}:* ${preview}`);
      }

      const chunks = splitMessage(lines.join("\n\n"));
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "MarkdownV2" });
      }
    } catch (err) {
      await ctx.reply(`Failed to fetch history: ${String(err)}`);
    }
  });

  // Handle callback queries (session switch, permissions)
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Session switch: switch:<sessionId>
    if (data.startsWith("switch:")) {
      const sessionId = data.slice("switch:".length);
      const chatId = ctx.chat?.id;
      if (!chatId || !sessionId) {
        await ctx.answerCallbackQuery({ text: "Invalid switch data" });
        return;
      }
      switchSession(chatId, sessionId);
      await ctx.answerCallbackQuery({ text: "Session switched" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      return;
    }

    if (!data.startsWith("perm:")) {
      await ctx.answerCallbackQuery();
      return;
    }
    // Format: perm:<response>:<sessionId>:<permissionId>
    const [, response, sessionId, permissionId] = data.split(":");
    if (!response || !sessionId || !permissionId) {
      await ctx.answerCallbackQuery({ text: "Invalid permission data" });
      return;
    }
    const permResponse = response === "allow" ? "once" : "reject";
    try {
      await replyPermission(sessionId, permissionId, permResponse);
      await ctx.answerCallbackQuery({ text: `Permission ${response === "allow" ? "granted" : "denied"}` });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch (err) {
      await ctx.answerCallbackQuery({ text: `Error: ${String(err)}` });
    }
  });

  // Text message handler — forward to OpenCode with streaming
  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    try {
      const { sessionId, fallback } = await getOrCreateSession(chatId);
      if (fallback) {
        await ctx.reply(
          escapeMarkdownV2("Previous session no longer available. Started a new session."),
          { parse_mode: "MarkdownV2" },
        );
      }

      // Send placeholder (not as a reply, to avoid quoting the user's message)
      const placeholder = await ctx.api.sendMessage(
        chatId,
        escapeMarkdownV2("thinking..."),
        { parse_mode: "MarkdownV2" },
      );
      const placeholderMsgId = placeholder.message_id;

      // Send typing status, refreshed every 4s until done
      let typingInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
        void ctx.api.sendChatAction(chatId, "typing");
      }, 4000);
      void ctx.api.sendChatAction(chatId, "typing");

      const stopTyping = () => {
        if (typingInterval) {
          clearInterval(typingInterval);
          typingInterval = null;
        }
      };

      let lastEditTime = 0;
      let editTimer: ReturnType<typeof setTimeout> | null = null;
      let latestPreview = "";

      const flushEdit = () => {
        if (latestPreview) {
          void editMessage(ctx, placeholderMsgId, latestPreview);
          lastEditTime = Date.now();
        }
      };

      // Fire prompt (non-blocking — events will stream in)
      const promptDone = sendPrompt(sessionId, ctx.message.text);

      registerSession(
        sessionId,
        // onPart — throttled edit-in-place
        (parts: Part[]) => {
          latestPreview = formatPartsPreview(parts);
          const now = Date.now();
          const elapsed = now - lastEditTime;

          if (elapsed >= THROTTLE_MS) {
            if (editTimer) clearTimeout(editTimer);
            editTimer = null;
            flushEdit();
          } else if (!editTimer) {
            editTimer = setTimeout(flushEdit, THROTTLE_MS - elapsed);
          }
        },
        // onError
        async (error: string) => {
          if (editTimer) clearTimeout(editTimer);
          stopTyping();
          await editMessage(
            ctx,
            placeholderMsgId,
            escapeMarkdownV2(`Error: ${error}`),
          );
        },
        // onDone
        async (parts: Part[]) => {
          if (editTimer) clearTimeout(editTimer);
          stopTyping();
          // Final message: format and split
          const formatted = formatParts(parts);
          const chunks = splitMessage(formatted || escapeMarkdownV2("(empty response)"));

          // Replace placeholder with first chunk
          await editMessage(ctx, placeholderMsgId, chunks[0]!);

          // Send remaining chunks as new messages
          for (let i = 1; i < chunks.length; i++) {
            await ctx.reply(chunks[i]!, { parse_mode: "MarkdownV2" });
          }
        },
        // onPermission
        async (perm: Permission) => {
          if (isAutoApprove(perm.sessionID)) {
            await replyPermission(perm.sessionID, perm.id, "once");
            await ctx.reply(
              escapeMarkdownV2(`Auto-approved: ${perm.title}`),
              { parse_mode: "MarkdownV2" },
            );
            return;
          }
          const keyboard = new InlineKeyboard()
            .text("Allow", `perm:allow:${perm.sessionID}:${perm.id}`)
            .text("Deny", `perm:deny:${perm.sessionID}:${perm.id}`);
          await ctx.reply(formatPermissionMessage(perm), {
            parse_mode: "MarkdownV2",
            reply_markup: keyboard,
          });
        },
      );

      // Await prompt completion as fallback (in case SSE events don't fire session.idle)
      try {
        await promptDone;
      } catch (err) {
        // If prompt itself throws and no SSE error was received, clean up
        if (isSessionRegistered(sessionId)) {
          unregisterSession(sessionId);
          if (editTimer) clearTimeout(editTimer);
          stopTyping();
          await editMessage(
            ctx,
            placeholderMsgId,
            escapeMarkdownV2(`Error: ${String(err)}`),
          );
        }
      }
    } catch (err) {
      await ctx.reply(`Error: ${String(err)}`);
    }
  });

  return bot;
}
