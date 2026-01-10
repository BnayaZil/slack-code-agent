export interface ChannelData {
  projectPath: string;
  cursorChatId: string;
  createdAt: string;
}

export interface PollState {
  channels: Record<string, { lastSeenTs: string }>;
}

export interface CursorResponse {
  type: string;
  subtype: string;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  result: string;
  session_id: string;
  request_id: string;
}

export interface Config {
  slackBotToken: string;
  slackBotUserId: string;
  pollIntervalMs: number;
  dataDir: string;
  baseProjectPath: string;
}
