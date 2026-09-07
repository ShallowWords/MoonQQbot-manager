# QQBOT Console — QQ Bot Management Panel

> **English · [中文](README.md)**

A local, visual management tool for **multiple QQ bots + character persona/memory documents + any OpenAI-compatible model**, with a built-in **Panel Admin AI**, **heartbeat tasks**, and **highlight moments**.

```
QQ user sends message → bot gateway (qq-guild-bot over WebSocket)
   → assemble persona (memory/<id>/*.md) + recent sessions
   → call the bound model (DeepSeek / SiliconFlow / Zhipu / Ollama…)
   → auto-reply and append to session history
   → manage & monitor from the web panel (http://127.0.0.1:4357)
```

## Features

| Area | Description |
|------|-------------|
| Multiple bots | Add / edit / delete multiple QQ bots with independent AppID/Secret; live status (green = connected / yellow = chatting / red = offline) |
| Memory vault | Multiple Markdown files per bot (persona / plot / content…), enable per file, AI-assisted filing, full-text search, session branching |
| Model provider | DeepSeek or any OpenAI-compatible endpoint; bind to a bot, one-click connectivity test, token usage stats |
| Web search | function-calling based search: lightweight title/summary ⇄ headless-browser page fetch, auto tiered (overridable per bot) |
| Panel Admin AI | Built-in agent: read-only evaluation → generates "pending-confirm" edit proposals; nothing is written until you approve in the panel; conversations persist across sessions |
| Heartbeat tasks | Bots speak proactively: each task card is one schedule — timer / interval / random, up to 3 tasks per bot |
| Highlight moments | AI extracts the character's standout moments from memory files + recent chats, shown on the bot card |
| Appearance | Accent color / light-dark theme / card background effects (pixel wave, light stream, matrix rain, meteor) |

## Quick Deploy (from GitHub in 3 steps)

**Windows**: double-click **`安装并启动.bat`** — it runs `npm install`, generates missing `config.json` / `.env` from the examples (never overwrites existing files), starts the panel and opens the browser.

**macOS / Linux**:

```bash
npm install
npm run setup     # one-shot init: check deps + copy missing example configs
npm start
```

Then set your credentials either way:
1. edit `config.json` (bot AppID, bound model) and `.env` (QQ Secret, model API keys); or
2. open **http://127.0.0.1:4357** and add bots / models visually in the panel (saved automatically).

> For web-search / browser features, Playwright prepares its browser engine on first use; for long-running processes use `pm2 start server.js --name qqbot-panel`.

## Structure

```
server.js            Entry: HTTP panel + API + QQ bot scheduler
setup.js             one-shot init (auto-copies missing example configs)
安装并启动.bat        Windows one-click: install deps → init → run
lib/
  bots.js            QQ bot lifecycle & connection
  memory.js          memory vault / sessions / global settings
  models.js          OpenAI-compatible model calls (with tool support)
  qqv2.js            QQ v2 gateway
  search.js          web search (light + browser)
  store.js           config read/write
public/              Panel frontend (vanilla HTML/CSS/JS, no build step)
memory/              Runtime data: character memory & chat logs (do NOT commit)
avatars/             Uploaded avatars (do NOT commit)
```

## Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Prepare config** (copy examples and fill in credentials)

   ```bash
   cp config.example.json config.json
   cp .env.example .env
   ```

   - `.env` holds secrets: QQ Secret, model API keys
   - `config.json` holds bots (AppID, bound model, `apiKeyEnv` pointing at an `.env` var)
   - You can also add/edit bots & models directly in the panel — changes persist automatically

3. **Start**

   ```bash
   npm start
   ```

   On Windows you may double-click `start.cmd`. The panel opens at **http://127.0.0.1:4357**.

4. **Invite the bot to a guild / DM it** to start chatting; refine the persona memory in the panel to shape replies.

## Config & Security (important)

| File | Purpose | Commit to repo |
|------|---------|----------------|
| `config.json` | port, bots, models | **No** (holds credentials; gitignored) |
| `.env` | QQ Secret, model API keys | **No** (gitignored) |
| `memory/` | character memory, chat logs | **No** (gitignored) |
| `avatars/` | uploaded avatars | No |
| `config.example.json` / `.env.example` | public placeholders | Yes |

- The server listens on `127.0.0.1` only — the panel is local-only.
- Secrets can be stored directly in `config.json` or referenced as `env:VARIABLE_NAME` (recommended) so keys live in `.env`.
- Before publishing this repo, make sure the runtime files above are not tracked; `.gitignore` excludes them by default.

## Tips

- **Bot won't connect**: verify AppID and the Secret in `.env`, then check the terminal logs.
- **No reply / errors**: make sure the bot has a bound model and its `apiKeyEnv` key is valid (use the one-click test in the Models page).
- **Reset a bot**: use "Clear" on the sessions card; memory files can be disabled/deleted individually.
- **Make a bot proactive**: configure heartbeat tasks at the bottom of a bot's detail page — one schedule per card.
- **AI highlights**: click "✨ Summarize highlights" on the bot card, or ask the Panel Admin "summarize BOT1's highlights".
