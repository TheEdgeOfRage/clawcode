import { spawnSync } from "node:child_process";
import { Bot, InlineKeyboard, type Context } from "grammy";
import type { Part } from "@opencode-ai/sdk";
import * as log from "./log.js";
import type { PermissionEvent } from "./events.js";
import { escapeMarkdownV2, formatParts, formatTextParts, splitMessage } from "./format.js";
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
import { registerSession, unregisterSession } from "./events.js";
import { saveExchange } from "./memory.js";

const THROTTLE_MS = 2000;

// Telegram callback data is limited to 64 bytes. Permission IDs are too long,
// so we store them in a map keyed by a short incrementing counter.
let permCounter = 0;
const pendingPerms = new Map<string, { sessionId: string; permissionId: string }>();

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

function formatPermissionMessage(perm: PermissionEvent): string {
  const lines = [escapeMarkdownV2(`Permission: ${perm.permission}`)];
  if (perm.patterns.length > 0) {
    lines.push(escapeMarkdownV2(perm.patterns.join("\n")));
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
    log.info(`[cmd] /start_llama chat=${ctx.chat.id}`);
    try {
      const proc = spawnSync("systemctl", ["--user", "start", "llama"]);
      if (proc.status === 0) {
        await ctx.reply("llama started\\.", { parse_mode: "MarkdownV2" });
      } else {
        const stderr = proc.stderr?.toString().trim();
        log.error(`[cmd] /start_llama failed: ${stderr}`);
        await ctx.reply(`Failed to start llama: ${stderr}`);
      }
    } catch (err) {
      log.error(`[cmd] /start_llama error:`, err);
      await ctx.reply(`Error: ${String(err)}`);
    }
  });

  bot.command("stop_llama", async (ctx) => {
    log.info(`[cmd] /stop_llama chat=${ctx.chat.id}`);
    try {
      const proc = spawnSync("systemctl", ["--user", "stop", "llama"]);
      if (proc.status === 0) {
        await ctx.reply("llama stopped\\.", { parse_mode: "MarkdownV2" });
      } else {
        const stderr = proc.stderr?.toString().trim();
        log.error(`[cmd] /stop_llama failed: ${stderr}`);
        await ctx.reply(`Failed to stop llama: ${stderr}`);
      }
    } catch (err) {
      log.error(`[cmd] /stop_llama error:`, err);
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
    log.info(`[cmd] /new chat=${chatId}`);
    try {
      const sessionId = await createNewSession(chatId);
      log.info(`[session] created session=${sessionId} chat=${chatId}`);
      await ctx.reply(`New session created: \`${escapeMarkdownV2(sessionId)}\``, {
        parse_mode: "MarkdownV2",
      });
    } catch (err) {
      log.error(`[cmd] /new error:`, err);
      await ctx.reply(`Failed to create session: ${String(err)}`);
    }
  });

  bot.command("sessions", async (ctx) => {
    log.info(`[cmd] /sessions chat=${ctx.chat.id}`);
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
      log.error(`[cmd] /sessions error:`, err);
      await ctx.reply(`Failed to list sessions: ${String(err)}`);
    }
  });

  bot.command("abort", async (ctx) => {
    const sessionId = getSessionId(ctx.chat.id);
    log.info(`[cmd] /abort chat=${ctx.chat.id} session=${sessionId ?? "none"}`);
    if (!sessionId) {
      await ctx.reply("No active session to abort.");
      return;
    }
    try {
      await abortSession(sessionId);
      log.info(`[session] aborted session=${sessionId}`);
      await ctx.reply("Session aborted\\.", { parse_mode: "MarkdownV2" });
    } catch (err) {
      log.error(`[cmd] /abort error:`, err);
      await ctx.reply(`Failed to abort: ${String(err)}`);
    }
  });

  bot.command("autoapprove", async (ctx) => {
    log.info(`[cmd] /autoapprove chat=${ctx.chat.id}`);
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
    log.info(`[session] autoapprove=${enabled} session=${sessionId}`);
    await ctx.reply(
      escapeMarkdownV2(`Auto-approve ${enabled ? "enabled" : "disabled"} for current session.`),
      { parse_mode: "MarkdownV2" },
    );
  });

  bot.command("history", async (ctx) => {
    log.info(`[cmd] /history chat=${ctx.chat.id}`);
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
      log.error(`[cmd] /history error:`, err);
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
      log.info(`[session] switched to session=${sessionId} chat=${chatId}`);
      await ctx.answerCallbackQuery({ text: "Session switched" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      return;
    }

    // Format: p:<allow|deny>:<key>
    if (!data.startsWith("p:")) {
      await ctx.answerCallbackQuery();
      return;
    }
    const [, action, key] = data.split(":");
    const perm = key ? pendingPerms.get(key) : undefined;
    if (!action || !perm) {
      await ctx.answerCallbackQuery({ text: "Permission expired" });
      return;
    }
    pendingPerms.delete(key!);
    const responseMap: Record<string, "once" | "always" | "reject"> = { a: "once", s: "always", d: "reject" };
    const permResponse = responseMap[action] ?? "reject";
    try {
      await replyPermission(perm.sessionId, perm.permissionId, permResponse);
      log.info(`[permission] ${permResponse} session=${perm.sessionId} perm=${perm.permissionId}`);
      await ctx.answerCallbackQuery({ text: `Permission: ${permResponse}` });
      await ctx.deleteMessage();
    } catch (err) {
      log.error(`[permission] reply error:`, err);
      await ctx.answerCallbackQuery({ text: `Error: ${String(err)}` });
    }
  });

  bot.command("remember", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.match?.trim();
    log.info(`[cmd] /remember chat=${chatId}`);
    if (!text) {
      await ctx.reply("Usage: /remember \\<what to remember\\>", { parse_mode: "MarkdownV2" });
      return;
    }
    try {
      const { sessionId } = await getOrCreateSession(chatId);
      const prompt = `Use the remember skill to save this memory: ${text}`;
      sendPrompt(sessionId, prompt)
        .then(async (parts) => {
          const chunks = splitMessage(formatTextParts(parts));
          for (const chunk of chunks) {
            await ctx.api.sendMessage(chatId, chunk, { parse_mode: "MarkdownV2" });
          }
        })
        .catch(async (err) => {
          log.error(`[remember] error:`, err);
          await ctx.reply(escapeMarkdownV2(`Error: ${String(err)}`), { parse_mode: "MarkdownV2" });
        });
    } catch (err) {
      log.error(`[cmd] /remember error:`, err);
      await ctx.reply(`Error: ${String(err)}`);
    }
  });

  // Text message handler — forward to OpenCode with streaming
  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    log.info(`[prompt] message received chat=${chatId}`);
    try {
      const { sessionId, fallback } = await getOrCreateSession(chatId);
      if (fallback) {
        log.info(`[session] previous session gone, created new session=${sessionId} chat=${chatId}`);
        await ctx.reply(
          escapeMarkdownV2("Previous session no longer available. Started a new session."),
          { parse_mode: "MarkdownV2" },
        );
      }

      // Typing indicator, refreshed every 4s
      let typingInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
        void ctx.api.sendChatAction(chatId, "typing");
      }, 4000);
      void ctx.api.sendChatAction(chatId, "typing");

      // Streaming state
      let responseMsgId: number | null = null;
      let sendingFirst = false;
      let lastEditTime = 0;
      let editTimer: ReturnType<typeof setTimeout> | null = null;
      let latestPreview = "";

      const cleanup = () => {
        if (editTimer) { clearTimeout(editTimer); editTimer = null; }
        if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
        unregisterSession(sessionId);
      };

      const flushEdit = () => {
        if (latestPreview && responseMsgId !== null) {
          void editMessage(ctx, responseMsgId, latestPreview);
          lastEditTime = Date.now();
        }
      };

      // Register SSE handlers for streaming and permissions before firing prompt
      registerSession(
        sessionId,
        // onPart — send first message on first data, then throttled edits
        (parts: Part[]) => {
          latestPreview = formatPartsPreview(parts);
          if (responseMsgId === null) {
            if (sendingFirst) return;
            sendingFirst = true;
            void ctx.api.sendMessage(chatId, latestPreview, { parse_mode: "MarkdownV2" })
              .then((msg) => { responseMsgId = msg.message_id; lastEditTime = Date.now(); })
              .catch((err) => log.error(`[prompt] failed to send first message:`, err));
            return;
          }
          const elapsed = Date.now() - lastEditTime;
          if (elapsed >= THROTTLE_MS) {
            if (editTimer) clearTimeout(editTimer);
            editTimer = null;
            flushEdit();
          } else if (!editTimer) {
            editTimer = setTimeout(flushEdit, THROTTLE_MS - elapsed);
          }
        },
        // onPermission
        async (perm: PermissionEvent) => {
          log.info(`[permission] request permission=${perm.permission} session=${perm.sessionID} perm=${perm.id}`);
          if (isAutoApprove(perm.sessionID)) {
            log.info(`[permission] auto-approving perm=${perm.id}`);
            await replyPermission(perm.sessionID, perm.id, "once");
            await ctx.api.sendMessage(chatId,
              escapeMarkdownV2(`Auto-approved: ${perm.permission} ${perm.patterns.join(", ")}`),
              { parse_mode: "MarkdownV2" },
            );
            return;
          }
          const key = String(++permCounter);
          pendingPerms.set(key, { sessionId: perm.sessionID, permissionId: perm.id });
          const keyboard = new InlineKeyboard()
            .text("Allow", `p:a:${key}`)
            .text("Session", `p:s:${key}`)
            .text("Deny", `p:d:${key}`);
          await ctx.api.sendMessage(chatId, formatPermissionMessage(perm), {
            parse_mode: "MarkdownV2",
            reply_markup: keyboard,
          });
        },
      );

      // Fire prompt without blocking grammY's update loop (permissions need callback handling)
      const userText = ctx.message.text;
      log.info(`[prompt] sending to session=${sessionId}`);
      sendPrompt(sessionId, userText)
        .then(async (parts) => {
          cleanup();
          // Send final text as separate new message(s)
          const textContent = formatTextParts(parts);
          if (textContent) {
            const chunks = splitMessage(textContent);
            log.info(`[prompt] done session=${sessionId} chunks=${chunks.length}`);
            for (const chunk of chunks) {
              await ctx.api.sendMessage(chatId, chunk, { parse_mode: "MarkdownV2" });
            }
          }
          // Save exchange to disk for qmd indexing
          try {
            saveExchange(userText, formatTextParts(parts));
          } catch (err) {
            log.error(`[memory] failed to save exchange:`, err);
          }
        })
        .catch(async (err) => {
          cleanup();
          log.error(`[prompt] error session=${sessionId}:`, err);
          const errText = escapeMarkdownV2(`Error: ${String(err)}`);
          if (responseMsgId !== null) {
            await editMessage(ctx, responseMsgId, errText);
          } else {
            await ctx.api.sendMessage(chatId, errText, { parse_mode: "MarkdownV2" });
          }
        });
    } catch (err) {
      log.error(`[prompt] unhandled error chat=${chatId}:`, err);
      await ctx.reply(`Error: ${String(err)}`);
    }
  });

  return bot;
}
