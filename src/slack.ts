import { WebClient } from "@slack/web-api";
import { config } from "./config.js";

const client = new WebClient(config.slackBotToken);

export interface SlackMessage {
  ts: string;
  user?: string;
  text?: string;
  bot_id?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
}

/**
 * List all channels where the bot is a member
 */
export async function listBotChannels(): Promise<SlackChannel[]> {
  const result = await client.conversations.list({
    types: "public_channel,private_channel",
  });

  if (!result.channels) {
    return [];
  }

  return result.channels
    .filter((ch) => ch.is_member && ch.id && ch.name)
    .map((ch) => ({
      id: ch.id!,
      name: ch.name!,
      is_member: ch.is_member!,
    }));
}

/**
 * Get message history for a channel since a given timestamp
 */
export async function getHistory(
  channelId: string,
  oldest?: string
): Promise<SlackMessage[]> {
  const params: { channel: string; oldest?: string; limit: number } = {
    channel: channelId,
    limit: 100,
  };

  if (oldest) {
    params.oldest = oldest;
  }

  const result = await client.conversations.history(params);

  if (!result.messages) {
    return [];
  }

  return result.messages
    .filter((msg) => msg.ts && msg.text !== undefined)
    .map((msg) => ({
      ts: msg.ts!,
      user: msg.user,
      text: msg.text,
      bot_id: msg.bot_id,
    }))
    .reverse();
}

/**
 * Post a message to a channel
 */
export async function postMessage(
  channelId: string,
  text: string
): Promise<string | undefined> {
  const result = await client.chat.postMessage({
    channel: channelId,
    text,
  });
  return result.ts;
}

/**
 * Update an existing message
 */
export async function updateMessage(
  channelId: string,
  ts: string,
  text: string
): Promise<void> {
  await client.chat.update({
    channel: channelId,
    ts,
    text,
  });
}

/**
 * Add a reaction to a message
 */
export async function addReaction(
  channelId: string,
  ts: string,
  emoji: string
): Promise<void> {
  try {
    await client.reactions.add({
      channel: channelId,
      timestamp: ts,
      name: emoji,
    });
  } catch {
    // Ignore reaction errors (e.g., already reacted)
  }
}

/**
 * Remove a reaction from a message
 */
export async function removeReaction(
  channelId: string,
  ts: string,
  emoji: string
): Promise<void> {
  try {
    await client.reactions.remove({
      channel: channelId,
      timestamp: ts,
      name: emoji,
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Check if a message mentions the bot
 */
export function mentionsBot(text: string | undefined): boolean {
  if (!text) return false;
  return text.includes(`<@${config.slackBotUserId}>`);
}

/**
 * Remove bot mention from message text
 */
export function removeBotMention(text: string): string {
  return text.replace(new RegExp(`<@${config.slackBotUserId}>`, "g"), "").trim();
}
