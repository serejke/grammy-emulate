// Demonstrates fault injection: force the emulator to fail specific Bot API
// calls with chosen error codes so the bot's error-path code actually runs.
import { describe, test, expect, beforeEach } from "vitest";
import { Bot, GrammyError } from "grammy";
import { emulator } from "grammy-emulate";
import { emuVitest } from "grammy-emulate/vitest";
import type { MountedBot, TestBot, TestChat, TestUser } from "grammy-emulate";

const emu = emulator();
emuVitest(emu);

describe("fault injection", () => {
  let bot: TestBot;
  let alice: TestUser;
  let dm: TestChat;
  let mounted: MountedBot<Bot>;
  let errors: Array<{ method: string; code: number; description: string }>;

  beforeEach(async () => {
    errors = [];
    bot = await emu.seed.bot({ username: "faulty_bot" });
    alice = await emu.seed.user({ first_name: "Alice" });
    dm = await emu.seed.privateChat(bot, alice);

    mounted = await emu.mount(bot, (token, apiRoot) => {
      const b = new Bot(token, { client: { apiRoot } });
      b.command("start", async (ctx) => {
        await ctx.reply("welcome");
      });
      b.catch(async (err) => {
        if (err.error instanceof GrammyError) {
          errors.push({
            method: err.error.method,
            code: err.error.error_code,
            description: err.error.description,
          });
        } else {
          errors.push({ method: "unknown", code: -1, description: String(err.error) });
        }
      });
      return b;
    });
  });

  test("429 with retry_after is surfaced as a GrammyError with parameters", async () => {
    await emu.faults.inject({
      bot,
      method: "sendMessage",
      code: 429,
      retryAfter: 2,
      count: 1,
    });

    await emu.as(alice).in(dm).send("/start");

    // Wait long enough for the poller to pick up, the handler to fire, and
    // the error to flow through bot.catch.
    await waitUntil(() => errors.length >= 1, { timeoutMs: 3000 });

    expect(errors).toHaveLength(1);
    expect(errors[0].method).toBe("sendMessage");
    expect(errors[0].code).toBe(429);
    // No reply landed because the single sendMessage call was the one that failed.
    expect(await emu.in(dm).replies()).toHaveLength(0);
  });

  test("403 on sendMessage simulates a user blocking the bot", async () => {
    await emu.faults.inject({ bot, method: "sendMessage", code: 403, count: 1 });

    await emu.as(alice).in(dm).send("/start");

    await waitUntil(() => errors.length >= 1, { timeoutMs: 3000 });
    expect(errors[0].code).toBe(403);
    expect(await emu.in(dm).replies()).toHaveLength(0);
  });

  test("fault with count > 1 fails each of the next N calls", async () => {
    await emu.faults.inject({ bot, method: "sendMessage", code: 429, retryAfter: 0, count: 2 });

    await emu.as(alice).in(dm).send("/start");
    await emu.as(alice).in(dm).send("/start");
    await emu.as(alice).in(dm).send("/start");

    await waitUntil(() => errors.length >= 2, { timeoutMs: 3000 });
    expect(errors).toHaveLength(2);

    // The third call succeeded after the fault expired.
    const replies = await emu.in(dm).waitForReplyCount(1, { timeoutMs: 3000 });
    expect(replies[0]?.text).toBe("welcome");
  });

  test("faults.during() clears automatically, even on exceptions inside the block", async () => {
    let caught: Error | null = null;

    try {
      await emu.faults.during(
        async () => {
          throw new Error("test boom");
        },
        { bot, method: "sendMessage", code: 401 },
      );
    } catch (e) {
      caught = e as Error;
    }

    expect(caught?.message).toBe("test boom");

    // Fault should be cleared — next sendMessage succeeds.
    await emu.as(alice).in(dm).send("/start");
    const reply = await emu.in(dm).waitForReply({ timeoutMs: 3000 });
    expect(reply).toMatchReply("welcome");
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
