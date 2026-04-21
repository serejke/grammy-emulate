import type { Bot } from "grammy";
import type { TestBot } from "@emulators/telegram/test";

export interface MountOptions {
  /** Polling mode only for now. Webhook mode is planned. */
  mode?: "polling";
  /** Override the timeout (in seconds) used by grammy's long-poll runner. */
  pollTimeout?: number;
}

export interface MountedBot<B extends Bot> {
  bot: B;
  stop: () => Promise<void>;
}

export interface MountContext {
  url: string;
}

/**
 * Boot a grammy bot against the running emulator and start long-polling.
 *
 * The factory receives the emulator's token + apiRoot and returns a Bot.
 * Register your handlers before returning. The helper will:
 *   1) call `bot.init()` to fetch bot info against the emulator
 *   2) start polling in the background (non-blocking)
 *   3) wait until polling is actively running before resolving
 *
 * Call the returned `stop()` in afterEach/afterAll to shut the poller down.
 */
export async function mountBot<B extends Bot>(
  ctx: MountContext,
  bot: TestBot,
  factory: (token: string, apiRoot: string) => B,
  _opts: MountOptions = {},
): Promise<MountedBot<B>> {
  const b = factory(bot.token, ctx.url);
  await b.init();

  // grammy's bot.start() blocks until polling stops; kick it off without awaiting
  // and capture the settle promise so we can wait cleanly on stop(). Use the
  // onStart callback to signal readiness — it fires AFTER drop-pending-updates
  // completes, so any messages sent by the test afterwards are guaranteed to
  // be picked up by the main poll loop (not dropped by the initial discard).
  let startErr: unknown;
  let onReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    onReady = resolve;
  });
  const started = b
    .start({
      drop_pending_updates: true,
      onStart: () => onReady(),
    })
    .catch((err: unknown) => {
      startErr = err;
      onReady();
    });

  await ready;
  if (startErr) throw startErr;

  return {
    bot: b,
    async stop() {
      await b.stop();
      await started;
    },
  };
}
