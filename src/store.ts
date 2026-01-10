import * as fs from "fs";
import * as path from "path";
import { config } from "./config.js";
import type { ChannelData, PollState } from "./types.js";

export type { ChannelData };

const stateFilePath = path.join(config.dataDir, "state.json");
const channelsDir = path.join(config.dataDir, "channels");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Poll State
export function loadPollState(): PollState {
  ensureDir(config.dataDir);
  if (!fs.existsSync(stateFilePath)) {
    return { channels: {} };
  }
  const data = fs.readFileSync(stateFilePath, "utf-8");
  return JSON.parse(data) as PollState;
}

export function savePollState(state: PollState): void {
  ensureDir(config.dataDir);
  fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
}

export function getLastSeenTs(channelId: string): string | undefined {
  const state = loadPollState();
  return state.channels[channelId]?.lastSeenTs;
}

export function setLastSeenTs(channelId: string, ts: string): void {
  const state = loadPollState();
  if (!state.channels[channelId]) {
    state.channels[channelId] = { lastSeenTs: ts };
  } else {
    state.channels[channelId].lastSeenTs = ts;
  }
  savePollState(state);
}

// Channel Data
function channelFilePath(channelId: string): string {
  return path.join(channelsDir, `${channelId}.json`);
}

export function loadChannelData(channelId: string): ChannelData | null {
  ensureDir(channelsDir);
  const filePath = channelFilePath(channelId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const data = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(data) as ChannelData;
}

export function saveChannelData(channelId: string, data: ChannelData): void {
  ensureDir(channelsDir);
  const filePath = channelFilePath(channelId);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function deleteChannelData(channelId: string): void {
  const filePath = channelFilePath(channelId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
