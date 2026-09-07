# QQBOT Console — QQ Bot Management Panel

> **English · [中文](README.md)**

A local, visual management tool for **multiple QQ bots + character persona/memory documents + any OpenAI-compatible model**, with a built-in **Panel Admin AI**, **heartbeat tasks**, and **highlight moments**. Everything runs in a build-free, vanilla frontend web panel.

```
QQ user sends message → bot gateway (qq-guild-bot over WebSocket)
   → assemble persona (memory/<id>/*.md) + recent sessions
   → call the bound model (DeepSeek / SiliconFlow / Zhipu / Ollama…)
   → auto-reply and append to session history
   → manage & monitor from the web panel (http://127.0.0.1:4357)
```

## Table of Contents

- [Feature Overview](#feature-overview)
- [Quick Deploy](#quick-deploy-from-github-in-3-steps)
- [Features in Detail](#features-in-detail)
- [Structure](#structure)
- [Config & Security](#config--security-important)
- [FAQ](#faq)

## Feature Overview

| Area | One-liner |
|------|-----------|
| Multiple bots | Independent AppID/Secret, live status, per-bot edit / reconnect / delete |
| Memory vault | Multiple Markdown files per bot — toggle, AI filing, branching |
| Sessions | Bubble chat with Markdown, delete one, export, clear |
| Model provider | Any OpenAI-compatible endpoint, one-click connectivity test, token stats |
| Web search | function-calling search with light / browser auto-tiering |
| Heartbeat tasks | Bots speak proactively: timer / interval / random, card-based multi-task |
| Highlight moments | AI extracts a character's standout moments onto the bot card |
| Panel Admin AI | Built-in agent: read-only review → pending-approval edit proposals |
| Appearance | Accent color, light/dark theme, card background effects |

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

## Features in Detail

### 1. Robot management

- **Multiple instances**: add as many QQ bots as you like from the sidebar; each has its own AppID/Secret, sandbox/live environment and bound model.
- **Live status dot**: 🟢 connected / 🟡 chatting / 🔴 offline or error — mirrored in the sidebar and the card.
- **Info card** (first card of a bot's page):
  - avatar (URL / emoji / uploaded image stored to `avatars/`);
  - name, "actively operating" tag, connection badge, AppID;
  - four info tiles: bound model, history length, key reference, memory file count;
  - status bar: environment (live/sandbox), web-search state, search mode, runtime status;
  - **highlight moments** section (§8) and the animated background canvas (§10).
- **Actions**: `↻ Reconnect`, `✎ Edit` (full form: AppID/Secret/model/history/env/web search/mode/avatar), `Delete` (confirm dialog).

### 2. Memory vault (memory/<botID>/)

A per-bot Markdown vault of multiple files, loaded as persona system prompts on replies.

- **Files**: e.g. persona / plot / content — **enable or disable each file**, edit body, set description, delete.
- **Use global settings**: toggle per bot — when on, global user/profile files are read first, then this vault; off uses the vault only.
- **AI filing**: describe a new plot point in the box and AI files it into the right memory file for you.
- **Branching**: restart a storyline from any history point and switch between branches.
- **Open folder**: jump to the bot's memory directory in your OS file manager.

### 3. Session history

- **Bubble chat**: user/bot bubbles with Markdown rendering (headings, lists, code, quotes).
- **Auto-scroll**: lands on the latest message when opened; scrolling up to read history isn't interrupted — follow resumes when you're back at the bottom.
- **Per-message**: `✕` delete a message (AI won't read it again) or `⑂` fork a new branch from it.
- **Card tools**: `⛶ Expand` full history modal, `⑂ Branches` (switch/resume), `⬇ Export` (plain text), `Clear` (confirm).
- **Direct chat**: the input at the bottom talks to the model directly (bypasses QQ) — handy for persona/model QA, with a "thinking…" placeholder.

### 4. Proactive messaging

At the bottom of a bot page, send messages yourself: pick **DM / group / guild**, set the target openid (auto-filled with the **master ID** — the first person who talked to you) and type the content.

### 5. Models & usage

- **Models page** (sidebar ▤): each model is one OpenAI-compatible endpoint (Base URL + model name); keys come from `.env` vars (`apiKeyEnv`) or inline.
- **One-click test**: `POST /api/models/:id/test` verifies connectivity.
- **Binding**: switch any bot to any model; bots without a model won't reply.
- **Token stats** (Settings → Usage): totals/today, calls/failures, per-bot horizontal bars, last-14-days column chart with count-up animation.

### 6. Web search (function calling)

- Global toggle + **tiering**: `Auto` (light first, upgrade to browser when needed), `Light only` (HTTP titles/summaries), `Browser only` (headless search).
- **Per-bot override** in the edit form (bot > global).
- The model invokes tools on demand and auto-fetches full pages when needed.

### 7. Heartbeat tasks (proactive speech)

Bottom of the bot page, "♥ Heartbeat tasks". **One card = one independent schedule**, up to 3 per bot, mixed modes allowed:

- `⏱ Interval`: every N minutes (min 5).
- `🕘 Timer`: daily recurring time points, each with its own task prompt.
- `🎲 Random`: trigger at a random minute within your min/max range.
- **Prompt**: write custom content per card (injected as a "heartbeat task" instruction); otherwise generated by tone (greet / advance plot / ask a question).
- **Status**: header shows "N enabled · next in ~X min" and the master ID; disabled cards desaturate.

### 8. Highlight moments ✨

AI-curated **standout moments** on the bot card (title + one-line takeaway + a signature quote, up to 3):

- **Trigger**: click "✨ Summarize highlights" on the card (or "↻ Re-summarize" when present); or ask the Panel Admin "summarize BOT1's highlights".
- **Source**: the bot's enabled memory files + its last 16 conversations, distilled by the bound model in a "script editor" role.
- **Manage**: delete one (hover ✕ + confirm); re-summarizing replaces the group and persists to `config.json`.

### 9. Panel Admin AI (agent)

Open the golden "◈ Panel Admin" entry in the sidebar for the built-in assistant:

- **Reads**: list/inspect bots, models, global settings; read any bot's memory files & sessions; full-text keyword search across the memory vault; and propose changes.
- **Safe-write model**: every change goes through "pending" — the admin only generates proposals (`propose_memory_edit / propose_global_edit / propose_bot_config_edit`), you press **Apply** to actually write; or ignore / edit it.
- **Summary & moments**: exposes `summarize_moments` (writes highlight moments) plus persona rewrite, story cleanup, content summaries.
- **Persistent sessions**: history list on the right keeps each conversation across visits; "New chat" anytime. Streaming output by default.
- **Fixed guidelines**: core instruction parts are hard-coded (see Settings → Web → Panel Admin) and keep the assistant in a read-only evaluation role.

### 10. Appearance & UI

- **Accent color**: presets (default gold / blue / green / purple / red / cyan / orange / pink) or a custom color picker — the whole UI follows.
- **Light/dark theme**: one-click toggle, remembered.
- **Card background effects** (bot info card): `🌊 Pixel wave`, `✨ Light stream`, `🖥 Matrix rain`, `☄ Meteor`, `◽ Plain`.
- **Visual language**: glass cards with top glaze, dimensional buttons/switches, gold hover feedback; Settings is split into tabs (Appearance / Web / Global files / Usage) to keep things tidy.

### 11. Data & storage

| Data | Location | Notes |
|------|----------|-------|
| Panel & bot config | `config.json` | port, bots, models |
| Secrets | `.env` | QQ Secret, model API keys (or `env:VAR` refs in config) |
| Character memory | `memory/<id>/*.md` | persona & plot files |
| Session history | `memory/<id>/sessions.jsonl` | one JSON line per message |
| Global files | `memory/global/*.md` | user profile, global prompts |
| Usage stats | `memory/usage.jsonl` | token call log |
| Avatars | `avatars/` | uploaded avatars |

> Runtime data above is **not committed** to Git by default (see [Config & Security](#config--security-important)).

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
- The panel echoes keys back for editing convenience, but traffic stays on this machine.
- Before publishing this repo, make sure the runtime files above are not tracked; `.gitignore` excludes them by default.

## FAQ

- **Panel won't open**: confirm `npm start` succeeds and port 4357 is free; on Windows, `安装并启动.bat` / `启动面板.bat` check the port and open the browser for you.
- **Bot won't connect**: verify the Secret in `.env` and the AppID on the card; check terminal logs.
- **No reply / errors**: make sure the bot has a bound model and its `apiKeyEnv` key is valid (one-click test in the Models page).
- **Persona drift**: edit `memory/<id>/persona.md` / `plot.md`, and toggle "use global settings" to control whether global prompts are layered in.
- **Restart a storyline**: fork from history in Sessions, or summarize new events into memory files with AI filing.
