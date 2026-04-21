# echo-bot example

A small production-shaped grammY bot used as the showcase for `grammy-emulate`.

## The bot

`src/bot.ts` — four commands (`/start`, `/echo`, `/menu`, `/connect`), an inline
keyboard with three callback actions (`menu:about`, `menu:help`, `menu:close`),
and a plain-text handler.

## The tests

- **`src/bot.test.ts`** — 8 end-to-end tests driven through the emulator.
  Every test boots the real grammY bot (long-polling against an in-process
  Bot API emulator), simulates user actions, and asserts on bot replies.

- **`src/bot.before.test.ts`** — the same `/echo hello` test written the
  "before" way: transformer mocks + hand-crafted `Update` objects. Kept for
  comparison — look at how much you have to fake by hand.

## Run

```bash
pnpm test
```

## Before / after at a glance

### Before — transformer mocks

```ts
bot.api.config.use((_prev, method, payload) => {
  if (method === "sendMessage") {
    return { ok: true, result: { message_id: 1 /* invent it */ } };
  }
  return { ok: true, result: true };
});

await bot.handleUpdate({
  update_id: 1,
  message: {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 111, type: "private", first_name: "Alice" },
    from: { id: 222, is_bot: false, first_name: "Alice" },
    text: "/echo hello",
    entities: [{ type: "bot_command", offset: 0, length: 5 }],
  },
});

expect(sent[0]?.payload.text).toBe("hello");
```

You invent `message_id`s. You invent chat shapes. You invent entity offsets.
You never exercise the wire format. Multi-turn flows — edits, callbacks,
follow-up messages — multiply the mocking surface.

### After — `grammy-emulate`

```ts
const bot = await emu.seed.bot({ username: "echo_bot" });
const alice = await emu.seed.user({ first_name: "Alice" });
const dm = await emu.seed.privateChat(bot, alice);
const mounted = await emu.mount(bot, buildEchoBot);

await emu.as(alice).in(dm).send("/echo hello");
const reply = await emu.in(dm).waitForReply();
expect(reply).toMatchReply("hello");
```

grammY talks to a real Bot API over HTTP, the emulator allocates real
`message_id`s, parses real entities, enforces Privacy Mode, and you can
continue the flow (click, edit, react, delete) as a user would.
