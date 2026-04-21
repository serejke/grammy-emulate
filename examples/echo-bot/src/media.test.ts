// Smoke tests for the non-photo media kinds: video, audio, voice, animation,
// sticker, document. Each kind round-trips a file_id the bot sees on the
// incoming message.
import { describe, test, expect, beforeEach } from "vitest";
import { Bot } from "grammy";
import { emulator } from "grammy-emulate";
import { emuVitest } from "grammy-emulate/vitest";
import type { TestBot, TestChat, TestUser } from "grammy-emulate";

const emu = emulator();
emuVitest(emu);

describe("simulate: non-photo media kinds", () => {
  let bot: TestBot;
  let alice: TestUser;
  let dm: TestChat;
  const fileIdsSeen: Record<string, string> = {};

  beforeEach(async () => {
    for (const k of Object.keys(fileIdsSeen)) delete fileIdsSeen[k];
    bot = await emu.seed.bot({ username: "media_bot", can_read_all_group_messages: true });
    alice = await emu.seed.user({ first_name: "Alice" });
    dm = await emu.seed.privateChat(bot, alice);

    await emu.mount(bot, (token, apiRoot) => {
      const b = new Bot(token, { client: { apiRoot } });
      b.on(":video", (ctx) => {
        fileIdsSeen.video = ctx.message?.video?.file_id ?? "";
      });
      b.on(":audio", (ctx) => {
        fileIdsSeen.audio = ctx.message?.audio?.file_id ?? "";
      });
      b.on(":voice", (ctx) => {
        fileIdsSeen.voice = ctx.message?.voice?.file_id ?? "";
      });
      b.on(":animation", (ctx) => {
        fileIdsSeen.animation = ctx.message?.animation?.file_id ?? "";
      });
      b.on(":sticker", (ctx) => {
        fileIdsSeen.sticker = ctx.message?.sticker?.file_id ?? "";
      });
      b.on(":document", (ctx) => {
        fileIdsSeen.document = ctx.message?.document?.file_id ?? "";
      });
      return b;
    });
  });

  const bytes = Buffer.from("hello world");

  test("sendVideo delivers a video message with a file_id", async () => {
    const r = await emu.as(alice).in(dm).sendVideo(bytes, { caption: "clip", mimeType: "video/mp4" });
    await waitUntil(() => !!fileIdsSeen.video, { timeoutMs: 2000 });
    expect(fileIdsSeen.video).toBe(r.file_id);
  });

  test("sendAudio delivers an audio message", async () => {
    const r = await emu.as(alice).in(dm).sendAudio(bytes, { mimeType: "audio/mpeg" });
    await waitUntil(() => !!fileIdsSeen.audio, { timeoutMs: 2000 });
    expect(fileIdsSeen.audio).toBe(r.file_id);
  });

  test("sendVoice delivers a voice message", async () => {
    const r = await emu.as(alice).in(dm).sendVoice(bytes, { mimeType: "audio/ogg", duration: 3 });
    await waitUntil(() => !!fileIdsSeen.voice, { timeoutMs: 2000 });
    expect(fileIdsSeen.voice).toBe(r.file_id);
  });

  test("sendAnimation delivers an animation", async () => {
    const r = await emu.as(alice).in(dm).sendAnimation(bytes, { mimeType: "video/mp4" });
    await waitUntil(() => !!fileIdsSeen.animation, { timeoutMs: 2000 });
    expect(fileIdsSeen.animation).toBe(r.file_id);
  });

  test("sendSticker delivers a sticker", async () => {
    const r = await emu.as(alice).in(dm).sendSticker(bytes, { mimeType: "image/webp" });
    await waitUntil(() => !!fileIdsSeen.sticker, { timeoutMs: 2000 });
    expect(fileIdsSeen.sticker).toBe(r.file_id);
  });

  test("sendDocument delivers a document with fileName", async () => {
    const r = await emu.as(alice).in(dm).sendDocument(bytes, { fileName: "notes.txt" });
    await waitUntil(() => !!fileIdsSeen.document, { timeoutMs: 2000 });
    expect(fileIdsSeen.document).toBe(r.file_id);
  });

  return;
});

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  { timeoutMs = 3000, intervalMs = 20 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
}
