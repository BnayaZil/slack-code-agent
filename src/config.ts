import { config as dotenvConfig } from "dotenv";
import type { Config } from "./types.js";

dotenvConfig();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config: Config = {
  slackBotToken: requireEnv("SLACK_BOT_TOKEN"),
  slackBotUserId: requireEnv("SLACK_BOT_USER_ID"),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "10000", 10),
  dataDir: process.env.DATA_DIR || "./data",
  baseProjectPath: process.env.BASE_PROJECT_PATH || "",
};
