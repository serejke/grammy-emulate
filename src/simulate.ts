import type { TelegramTestClient, TestChat, TestUser } from "@emulators/telegram/test";

export interface SimulateChatApi {
  send(text: string, opts?: { replyTo?: number }): Promise<{ message_id: number; update_id: number }>;
  sendPhoto(
    bytes: Buffer | Uint8Array,
    opts?: { caption?: string; mimeType?: string },
  ): Promise<{ message_id: number; update_id: number; file_id: string }>;
  sendDocument(
    bytes: Buffer | Uint8Array,
    opts?: { caption?: string; mimeType?: string; fileName?: string },
  ): Promise<{ message_id: number; update_id: number; file_id: string }>;
  edit(messageId: number, text: string): Promise<{ update_id: number }>;
  click(messageId: number, callbackData: string): Promise<{ callback_query_id: string; update_id: number }>;
  react(
    messageId: number,
    emoji: string | Array<{ type: "emoji"; emoji: string }>,
  ): Promise<{ update_id: number }>;
  reply(toMessageId: number, text: string): Promise<{ message_id: number; update_id: number }>;
}

export interface SimulateUserApi {
  in(chat: TestChat): SimulateChatApi;
}

export function createSimulate(tg: TelegramTestClient) {
  return function as(user: TestUser): SimulateUserApi {
    return {
      in(chat) {
        return {
          send(text, opts) {
            return tg.sendUserMessage({
              chatId: chat.id,
              userId: user.id,
              text,
              replyToMessageId: opts?.replyTo,
            });
          },
          sendPhoto(bytes, opts) {
            return tg.sendUserPhoto({
              chatId: chat.id,
              userId: user.id,
              photoBytes: bytes,
              mimeType: opts?.mimeType,
              caption: opts?.caption,
            });
          },
          sendDocument(bytes, opts) {
            return tg.sendUserMedia({
              chatId: chat.id,
              userId: user.id,
              kind: "document",
              bytes,
              mimeType: opts?.mimeType,
              caption: opts?.caption,
              fileName: opts?.fileName,
            });
          },
          edit(messageId, text) {
            return tg.editUserMessage({
              chatId: chat.id,
              messageId,
              userId: user.id,
              text,
            });
          },
          click(messageId, callbackData) {
            return tg.clickInlineButton({
              chatId: chat.id,
              userId: user.id,
              messageId,
              callbackData,
            });
          },
          react(messageId, emoji) {
            const reaction =
              typeof emoji === "string" ? [{ type: "emoji" as const, emoji }] : emoji;
            return tg.reactToMessage({
              chatId: chat.id,
              messageId,
              userId: user.id,
              reaction,
            });
          },
          reply(toMessageId, text) {
            return tg.sendUserMessage({
              chatId: chat.id,
              userId: user.id,
              text,
              replyToMessageId: toMessageId,
            });
          },
        };
      },
    };
  };
}
