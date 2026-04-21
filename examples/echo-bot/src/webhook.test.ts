// Demonstrates webhook-mode mount: the plugin stands up an HTTP receiver on
// a random free port, registers it with the emulator via setWebhook, and the
// emulator POSTs Updates to it. Tests look identical to polling-mode tests.
import { describe, test, expect, beforeEach } from "vitest";
import { Bot, InlineKeyboard } from "grammy";
import { emulator } from "grammy-emulate";
import { emuVitest } from "grammy-emulate/vitest";
import type { MountedBot, TestBot, TestChat, TestUser } from "grammy-emulate";

const emu = emulator();
emuVitest(emu);

describe("webhook mount mode", () => {
  let bot: TestBot;
  let alice: TestUser;
  let dm: TestChat;

  beforeEach(async () => {
    bot = await emu.seed.bot({ username: "hook_bot" });
    alice = await emu.seed.user({ first_name: "Alice" });
    dm = await emu.seed.privateChat(bot, alice);
  });

  test("delivers updates via webhook and round-trips /start -> reply", async () => {
    await emu.mount(
      bot,
      (token, apiRoot) => {
        const b = new Bot(token, { client: { apiRoot } });
        b.command("start", (ctx) => ctx.reply("welcome over webhook"));
        return b;
      },
      { mode: "webhook" },
    );

    await emu.as(alice).in(dm).send("/start");
    const reply = await emu.in(dm).waitForReply();
    expect(reply).toMatchReply("welcome over webhook");
  });

  test("callback queries round-trip through the webhook path", async () => {
    await emu.mount(
      bot,
      (token, apiRoot) => {
        const b = new Bot(token, { client: { apiRoot } });
        b.command("menu", (ctx) =>
          ctx.reply("pick", {
            reply_markup: new InlineKeyboard().text("go", "go"),
          }),
        );
        b.callbackQuery("go", async (ctx) => {
          await ctx.answerCallbackQuery({ text: "hit" });
          await ctx.editMessageText("you picked go");
        });
        return b;
      },
      { mode: "webhook" },
    );

    await emu.as(alice).in(dm).send("/menu");
    const menu = await emu.in(dm).waitForReply();
    const click = await emu.as(alice).in(dm).click(menu.message_id, "go");

    await waitUntil(async () => {
      const current = (await emu.in(dm).replies()).find((m) => m.message_id === menu.message_id);
      return !!current?.edit_date;
    });
    const edited = (await emu.in(dm).replies()).find((m) => m.message_id === menu.message_id);
    expect(edited?.text).toBe("you picked go");

    const answer = await emu.inspect.callbackAnswer(click.callback_query_id);
    expect(answer?.answer_text).toBe("hit");
  });

  test("allowed_updates filters which update types the bot sees", async () => {
    let messages = 0;
    let reactions = 0;

    await emu.mount(
      bot,
      (token, apiRoot) => {
        const b = new Bot(token, { client: { apiRoot } });
        b.on("message", () => {
          messages++;
        });
        b.on("message_reaction", () => {
          reactions++;
        });
        return b;
      },
      { mode: "webhook", allowedUpdates: ["message"] },
    );

    await emu.as(alice).in(dm).send("hello");
    // Send a message first so there's a message_id to react to.
    const firstMsg = (await emu.in(dm).messages())[0];
    await emu.as(alice).in(dm).react(firstMsg.message_id, "👍");

    await waitUntil(() => messages >= 1, { timeoutMs: 3000 });
    // Give reactions a moment to potentially arrive; they should not.
    await new Promise((r) => setTimeout(r, 200));
    expect(messages).toBe(1);
    expect(reactions).toBe(0);
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
