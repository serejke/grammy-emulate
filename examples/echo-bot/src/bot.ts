import { Bot, InlineKeyboard, type Context } from "grammy";

/**
 * A small production-shaped grammy bot used by the test suite.
 *
 * Commands:
 *   /start               welcome message
 *   /echo <text>         echoes the text back
 *   /menu                shows an inline keyboard with three actions
 *   /connect <code>      validates a 6-char code; replies OK or rejects
 *
 * Callbacks:
 *   menu:about   edits message to show an "About" blurb
 *   menu:help    edits message to show a "Help" blurb
 *   menu:close   deletes the menu message
 */
export function buildEchoBot(token: string, apiRoot: string): Bot {
  const bot = new Bot(token, { client: { apiRoot } });

  bot.command("start", async (ctx) => {
    await ctx.reply("Welcome! Try /echo hello or /menu.");
  });

  bot.command("echo", async (ctx) => {
    const text = ctx.match?.toString().trim();
    if (!text) {
      await ctx.reply("Usage: /echo <text>");
      return;
    }
    await ctx.reply(text);
  });

  bot.command("menu", async (ctx) => {
    const kb = new InlineKeyboard()
      .text("About", "menu:about")
      .text("Help", "menu:help")
      .row()
      .text("Close", "menu:close");
    await ctx.reply("Choose an option:", { reply_markup: kb });
  });

  bot.command("connect", async (ctx) => {
    const code = ctx.match?.toString().trim() ?? "";
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      await ctx.reply("Invalid code. Expected 6 characters (A-Z, 0-9).");
      return;
    }
    await ctx.reply(`Connected with code ${code}.`);
  });

  bot.callbackQuery("menu:about", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("About: this is a showcase grammy bot.");
  });

  bot.callbackQuery("menu:help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "Help: send /echo <text>, /menu for this keyboard, or /connect <code>.",
    );
  });

  bot.callbackQuery("menu:close", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "closed" });
    await ctx.deleteMessage();
  });

  // Plain text in groups: only respond if addressed (Privacy Mode handles this
  // automatically on the emulator side, so this handler only fires for
  // addressed messages).
  bot.on("message:text", async (ctx: Context) => {
    if (!ctx.message?.text?.startsWith("/")) {
      await ctx.reply(`You said: ${ctx.message?.text ?? ""}`);
    }
  });

  return bot;
}
