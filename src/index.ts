import { config } from "./config.js";
import * as slack from "./slack.js";
import * as cursor from "./cursor.js";
import * as store from "./store.js";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [bot] ${message}`);
}

const NEW_COMMAND_REGEX = /^\/new\s+(.+)$/;
const PROJECTS_COMMAND_REGEX = /^\/projects\s*$/;
const DIFF_COMMAND_REGEX = /^\/diff\s*$/;

function resolveProjectPath(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  if (config.baseProjectPath) {
    return path.join(config.baseProjectPath, inputPath);
  }
  return inputPath;
}

async function handleProjectsCommand(channelId: string): Promise<void> {
  if (!config.baseProjectPath) {
    await slack.postMessage(channelId, "⚠️ No base project path configured.");
    return;
  }

  try {
    const entries = fs.readdirSync(config.baseProjectPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();

    if (dirs.length === 0) {
      await slack.postMessage(channelId, "📁 No projects found.");
    } else {
      await slack.postMessage(
        channelId,
        `📁 *Projects in ${config.baseProjectPath}:*\n${dirs.map((d) => `• \`${d}\``).join("\n")}`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await slack.postMessage(channelId, `❌ Failed to list projects: ${msg}`);
  }
}

async function handleDiffCommand(channelId: string, channelData: store.ChannelData | null): Promise<void> {
  if (!channelData) {
    await slack.postMessage(channelId, "💡 No active conversation. Use `/new <project>` first.");
    return;
  }

  try {
    const diff = execSync("git diff", {
      cwd: channelData.projectPath,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024, // 1MB
    });

    if (!diff.trim()) {
      await slack.postMessage(channelId, "✨ No uncommitted changes.");
      return;
    }

    // Truncate if too long for Slack (max ~4000 chars in a code block)
    const maxLength = 3500;
    let output = diff;
    let truncated = false;
    if (diff.length > maxLength) {
      output = diff.substring(0, maxLength);
      truncated = true;
    }

    await slack.postMessage(
      channelId,
      `📝 *Git diff for* \`${channelData.projectPath}\`:\n\`\`\`diff\n${output}\`\`\`${truncated ? "\n_(truncated)_" : ""}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not a git repository")) {
      await slack.postMessage(channelId, "❌ Not a git repository.");
    } else {
      await slack.postMessage(channelId, `❌ Failed to get diff: ${msg}`);
    }
  }
}

async function handleNewCommand(channelId: string, projectName: string): Promise<void> {
  const projectPath = resolveProjectPath(projectName);
  log(`/new command: ${projectPath}`);

  if (!fs.existsSync(projectPath)) {
    await slack.postMessage(channelId, `❌ Path does not exist: \`${projectPath}\``);
    return;
  }

  const statusTs = await slack.postMessage(channelId, `⏳ Creating conversation for \`${projectPath}\`...`);

  try {
    const chatId = await cursor.createChat(projectPath);
    store.saveChannelData(channelId, {
      projectPath,
      cursorChatId: chatId,
      createdAt: new Date().toISOString(),
    });
    log(`Created conversation: ${chatId}`);

    if (statusTs) {
      await slack.updateMessage(channelId, statusTs, `✅ Started conversation for \`${projectPath}\``);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Error: ${msg}`);
    if (statusTs) {
      await slack.updateMessage(channelId, statusTs, `❌ Failed to create conversation: ${msg}`);
    } else {
      await slack.postMessage(channelId, `❌ Failed to create conversation: ${msg}`);
    }
  }
}

async function handlePrompt(
  channelId: string,
  messageTs: string,
  prompt: string,
  channelData: store.ChannelData
): Promise<void> {
  log(`Prompt to ${channelData.cursorChatId.substring(0, 8)}: "${prompt.substring(0, 50)}..."`);

  // Add thinking reaction to acknowledge receipt
  await slack.addReaction(channelId, messageTs, "hourglass_flowing_sand");

  try {
    const response = await cursor.sendPrompt(
      channelData.cursorChatId,
      channelData.projectPath,
      prompt
    );

    // Remove thinking reaction, add success
    await slack.removeReaction(channelId, messageTs, "hourglass_flowing_sand");
    await slack.addReaction(channelId, messageTs, "white_check_mark");

    await slack.postMessage(channelId, response);
  } catch (err) {
    // Remove thinking reaction, add error
    await slack.removeReaction(channelId, messageTs, "hourglass_flowing_sand");
    await slack.addReaction(channelId, messageTs, "x");

    const msg = err instanceof Error ? err.message : String(err);
    log(`Error: ${msg}`);

    // Format error nicely for Slack
    let userMessage = "❌ *Error processing your request*\n";
    if (msg.includes("resource_exhausted")) {
      userMessage += "```Rate limit exceeded. Please wait a moment and try again.```";
    } else if (msg.includes("timeout") || msg.includes("Timeout")) {
      userMessage += "```Request timed out. The operation took too long.```";
    } else {
      userMessage += `\`\`\`${msg.substring(0, 500)}\`\`\``;
    }
    await slack.postMessage(channelId, userMessage);
  }
}

async function processMessage(channelId: string, message: slack.SlackMessage): Promise<void> {
  const text = message.text || "";
  const cleanText = slack.removeBotMention(text);

  // /projects command
  if (PROJECTS_COMMAND_REGEX.test(cleanText)) {
    await handleProjectsCommand(channelId);
    return;
  }

  // /new command
  const newMatch = cleanText.match(NEW_COMMAND_REGEX);
  if (newMatch) {
    await handleNewCommand(channelId, newMatch[1].trim());
    return;
  }

  // /diff command
  if (DIFF_COMMAND_REGEX.test(cleanText)) {
    const channelData = store.loadChannelData(channelId);
    await handleDiffCommand(channelId, channelData);
    return;
  }

  // Forward to Cursor
  const channelData = store.loadChannelData(channelId);
  if (!channelData) {
    await slack.postMessage(
      channelId,
      "💡 No active conversation. Use `/new <project>` to start one.\nUse `/projects` to see available projects."
    );
    return;
  }

  await handlePrompt(channelId, message.ts, cleanText, channelData);
}

async function pollChannel(channelId: string): Promise<void> {
  const lastSeenTs = store.getLastSeenTs(channelId);

  try {
    const messages = await slack.getHistory(channelId, lastSeenTs);

    // First poll: mark all as seen without processing
    if (!lastSeenTs && messages.length > 0) {
      const latestTs = messages[messages.length - 1].ts;
      log(`First poll for ${channelId}, skipping ${messages.length} existing messages`);
      store.setLastSeenTs(channelId, latestTs);
      return;
    }

    for (const message of messages) {
      store.setLastSeenTs(channelId, message.ts);

      // Skip bot messages
      if (message.bot_id) continue;

      // Only process if channel has conversation OR message mentions bot
      const channelData = store.loadChannelData(channelId);
      const mentions = slack.mentionsBot(message.text);

      if (!channelData && !mentions) continue;

      await processMessage(channelId, message);
    }
  } catch (err) {
    console.error(`Poll error for ${channelId}:`, err);
  }
}

async function poll(): Promise<void> {
  try {
    const channels = await slack.listBotChannels();
    for (const channel of channels) {
      await pollChannel(channel.id);
    }
  } catch (err) {
    console.error("Poll error:", err);
  }
}

async function main(): Promise<void> {
  console.log("🤖 Slack Cursor Bot starting...");
  console.log(`   Poll interval: ${config.pollIntervalMs}ms`);
  console.log(`   Data directory: ${config.dataDir}`);
  console.log(`   Base project path: ${config.baseProjectPath || "(not set)"}`);

  await poll();
  setInterval(poll, config.pollIntervalMs);

  console.log("✅ Bot is running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
