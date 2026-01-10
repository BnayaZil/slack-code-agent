# Slack Cursor Agent Bot

A polling bot that bridges Slack channels to Cursor Agent CLI. Start a conversation with `/new <path>`, then all channel messages flow directly to the agent.

## Setup

### 1. Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name it (e.g., "Cursor Bot") and select your workspace

### 2. Configure OAuth Scopes

Go to **OAuth & Permissions** → **Scopes** → **Bot Token Scopes** and add:

- `channels:history` - Read messages in public channels
- `channels:read` - List channels
- `chat:write` - Post messages
- `users:read` - Read user info

### 3. Install to Workspace

1. Go to **OAuth & Permissions** → Click **Install to Workspace**
2. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### 4. Get Bot User ID

1. Go to your Slack workspace
2. Click on the bot in the sidebar or mention it
3. View the bot's profile
4. Click the **⋮** menu → **Copy member ID**

### 5. Configure Environment

Create a `.env` file:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_BOT_USER_ID=U12345YOURBOTID
POLL_INTERVAL_MS=10000
DATA_DIR=./data
```

### 6. Install Dependencies

```bash
npm install
```

### 7. Run the Bot

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

## Usage

### Invite the Bot to a Channel

In Slack, invite the bot to any channel:
```
/invite @cursor-bot
```

### Start a Conversation

Mention the bot with the `/new` command and a project path:
```
@cursor-bot /new /Users/me/myproject
```

The bot will respond:
```
Started conversation for /Users/me/myproject
```

### Chat with the Agent

After starting a conversation, all messages in the channel are sent to the Cursor agent:

```
User: explain the main function
Bot:  [Cursor agent response]

User: refactor it to use async/await
Bot:  [Cursor agent response]
```

### Switch to a Different Project

Use `/new` again to start a fresh conversation for a different project:
```
@cursor-bot /new /Users/me/other-project
```

This replaces the current conversation.

### View Git Diff

Use `/diff` to see uncommitted changes in the active project:
```
@cursor-bot /diff
```

Posts a summary with file stats and uploads the full diff as a snippet in a thread.

### One-off Questions

Use `/temp` to ask a question without affecting the main conversation history:
```
@cursor-bot /temp explain what this regex does
```

Creates a temporary chat, sends the prompt, and replies in a thread. Useful for quick questions that don't need context from the ongoing conversation.

## How It Works

1. The bot polls Slack every 10 seconds (configurable)
2. When you use `/new`, it calls `cursor agent create-chat --workspace <path>`
3. Subsequent messages are sent via `cursor agent --resume <chatId> --workspace <path> -p "message"`
4. Responses are posted back to the channel

## Data Storage

The bot stores data in the `data/` directory:

- `data/state.json` - Last seen message timestamp per channel
- `data/channels/<channel_id>.json` - Active conversation (project path + chat ID)

## Requirements

- Node.js 18+
- Cursor CLI installed and authenticated (`cursor agent login`)
- Slack workspace with bot permissions
