// QQ 机器人管理面板主入口
// 启动：node server.js → 面板 http://127.0.0.1:4357 + 所有已启用机器人
'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const url = require('node:url');
const { spawn } = require('node:child_process');

const store = require('./lib/store');
const memory = require('./lib/memory');
const models = require('./lib/models');
const BotManager = require('./lib/bots');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const AVATAR_DIR = path.join(ROOT, 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

// ---- 上下文（各模块共享）----
const app = {
  env: store.loadEnv(),
  getConfig: store.getConfig,
  saveConfig: store.saveConfig,
  resolveSecret: store.resolveSecret,
  memory,
};

// 核心对话逻辑：记忆 + 历史 + 模型调用 + 关键剧情自动记录
// 返回模型回复（已剥离【记录】标记）；失败抛错。不负责写入会话记录。
async function chatWithBot(botId, content) {
  const cfg = app.getConfig();
  const bot = cfg.bots.find((b) => b.id === botId);
  if (!bot) throw new Error('机器人不存在');
  const model = cfg.models.find((m) => m.id === bot.modelId) || cfg.models[0];
  if (!model) throw new Error('该机器人未绑定模型');
  const apiKey = model.apiKey || app.env[model.apiKeyEnv];
  if (!apiKey) throw new Error('模型未配置 API Key');

  // 多文件记忆库 → system prompt
  const system = memory.buildSystemPrompt(botId) +
    '\n\n【记忆规则】\n对话中出现关键剧情变化（重要事件、人物关系变化、重大决定等）时，' +
    '在回复末尾单独附加一行，以【记录】开头并简述该关键剧情，格式：【记录】事件简述。';
  const history = memory.getRecentSessions(botId, bot.historyLimit || 10);

  const messages = [
    { role: 'system', content: system },
  ];
  for (const h of history.slice(0, -1)) messages.push({ role: h.role, content: h.content });
  messages.push({ role: 'user', content });

  let reply = await models.chat(model, messages, { apiKey });
  if (!reply) return '';

  // 解析 AI 自动记录的关键剧情（【记录】xxx）
  const record = /【记录】([\s\S]+)$/.exec(reply.trim());
  if (record) {
    const event = record[1].trim();
    if (event) memory.appendKeyEvent(botId, event);
    reply = reply.replace(/【记录】[\s\S]+$/, '').trim();
    console.log(`[bot:${botId}] 已自动记录关键剧情: ${event.slice(0, 60)}`);
  }
  return reply;
}

app.handleMessage = async (botId, evt) => {
  console.log(`[bot:${botId}] handleMessage 被调用，evt=`, JSON.stringify(evt));
  const cfg = app.getConfig();
  const bot = cfg.bots.find((b) => b.id === botId);
  if (!bot) return;

  const content = String(evt.content || '').replace(/<@!?\d+>/g, '').trim();
  if (!content) return;

  const username = (evt.sender || evt.targetId || '').slice(0, 10) || '用户';
  console.log(`[${evt.scene}:${botId}] ${username}: ${content}`);
  memory.appendSession(botId, 'user', content);
  memory.saveLastSender(botId, evt.sender);

  try {
    const reply = await chatWithBot(botId, content);
    if (!reply) return;
    memory.appendSession(botId, 'assistant', reply);

    // 统一回复目标（normalizeEvent 已提供 targetId）
    if (!evt.targetId) {
      console.log(`[bot:${botId}] 缺少回复目标，不回复`);
      return;
    }
    await app.bots.send(bot, evt.scene, evt.targetId, reply.slice(0, 4000), evt.msgId);
    console.log(`[${evt.scene}:${botId}] 回复已发送`);
  } catch (err) {
    console.error(`[bot:${botId}] 回复失败:`, err.message);
  }
};

app.bots = new BotManager(app);

// ---- HTTP 服务（面板 + API）----
const server = http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  const p = u.pathname;

  // ---- API ----
  if (p.startsWith('/api/')) return handleApi(req, res, u);

  // ---- 头像静态资源（/avatars/*） ----
  if (p.startsWith('/avatars/')) {
    const full = path.join(AVATAR_DIR, path.basename(p));
    if (!full.startsWith(AVATAR_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(full).pipe(res);
    return;
  }

  // ---- 静态面板 ----
  const file = p === '/' ? 'index.html' : p.slice(1);
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  const ext = path.extname(full).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
});

// ---- API 路由 ----
// 从 AI 回复中提取所有 JSON 对象（容忍 ```json 包裹、多余文字、多个对象）
function extractJsonObjects(text) {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text || '');
  const s = (m ? m[1] : String(text || '')).trim();
  const objs = [];
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf('{', i);
    if (start < 0) break;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = start; j < s.length; j++) {
      const c = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) break;
    try { objs.push(JSON.parse(s.slice(start, end + 1))); } catch {}
    i = end + 1;
  }
  return objs;
}

function handleApi(req, res, u) {
  let p = u.pathname;
  try { p = decodeURIComponent(p); } catch { /* 保持原样 */ }
  const send = (code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };
  const readBody = (cb) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => { try { cb(JSON.parse(body || '{}')); } catch { send(400, { ok: false, err: 'JSON 解析失败' }); } });
  };

  // POST /api/upload-avatar — 上传本地图片作为头像（保存到项目 avatars/ 目录）
  if (p === '/api/upload-avatar' && req.method === 'POST') {
    readBody((body) => {
      try {
        const botId = String(body.botId || '');
        if (!/^[\w\u4e00-\u9fa5-]{1,64}$/.test(botId)) return send(400, { ok: false, err: '无效的 botId' });
        const ext = String(body.ext || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (!['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return send(400, { ok: false, err: '不支持的图片格式' });
        const data = String(body.data || '');
        if (data.length > 4_000_000) return send(400, { ok: false, err: '图片过大（限制约 3MB）' });
        const buf = Buffer.from(data, 'base64');
        if (!buf.length) return send(400, { ok: false, err: '图片数据为空' });
        const fname = `${botId}-${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(AVATAR_DIR, fname), buf);
        console.log(`[api] 头像已保存: ${fname}`);
        send(200, { ok: true, url: '/avatars/' + fname });
      } catch (err) { send(500, { ok: false, err: err.message }); }
    });
    return;
  }

  // GET /api/state — 全局状态
  if (p === '/api/state') {
    const cfg = app.getConfig();
    const envMask = Object.fromEntries(cfg.models.map((m) => [m.id, Boolean(m.apiKey || app.env[m.apiKeyEnv])]));
    return send(200, {
      ok: true,
      port: cfg.port,
      bots: cfg.bots.map((b) => ({ ...b, runtime: app.bots.getStatus(b.id) })),
      models: cfg.models.map((m) => ({ ...m, hasKey: envMask[m.id] })),
    });
  }

  // PUT /api/config — 保存配置并热重载
  if (p === '/api/config' && req.method === 'PUT') {
    readBody((body) => {
      const cfg = app.getConfig();
      if (body.bots) cfg.bots = body.bots;
      if (body.models) cfg.models = body.models;
      if (body.port) cfg.port = Number(body.port);
      app.saveConfig(cfg);
      app.bots.sync(cfg);
      send(200, { ok: true });
    });
    return;
  }

  // ---- 记忆 ----
  // GET /api/memory/:id/files — 全部记忆文件
  let m = /^\/api\/memory\/([\w\u4e00-\u9fa5-]+)\/files$/.exec(p);
  if (m && req.method === 'GET') return send(200, { ok: true, files: memory.getMemoryFiles(m[1]) });

  // POST /api/memory/:id/files — 新建记忆文件 { key }
  if (m && req.method === 'POST') {
    readBody((body) => {
      try {
        const key = (body.key || '').trim();
        if (!key) return send(400, { ok: false, err: '缺少文件名 key' });
        memory.saveMemoryFile(m[1], key, '');
        send(200, { ok: true });
      } catch (err) { send(500, { ok: false, err: err.message }); }
    });
    return;
  }

  // PUT /api/memory/:id/files/:key — 保存单个记忆文件
  m = /^\/api\/memory\/([\w\u4e00-\u9fa5-]+)\/files\/([\w\u4e00-\u9fa5-]+)$/.exec(p);
  if (m && req.method === 'PUT') {
    readBody((body) => {
      try { memory.saveMemoryFile(m[1], m[2], body.content || ''); send(200, { ok: true }); }
      catch (err) { send(500, { ok: false, err: err.message }); }
    });
    return;
  }

  // DELETE /api/memory/:id/files/:key — 删除记忆文件
  if (m && req.method === 'DELETE') {
    try { memory.deleteMemoryFile(m[1], m[2]); send(200, { ok: true }); }
    catch (err) { send(500, { ok: false, err: err.message }); }
    return;
  }

  // PUT /api/memory/:id/files/:key/enabled — 启用/禁用记忆文件 { enabled }
  m = /^\/api\/memory\/([\w\u4e00-\u9fa5-]+)\/files\/([\w\u4e00-\u9fa5-]+)\/enabled$/.exec(p);
  if (m && req.method === 'PUT') {
    readBody((body) => {
      try { memory.setFileEnabled(m[1], m[2], body.enabled !== false); send(200, { ok: true }); }
      catch (err) { send(500, { ok: false, err: err.message }); }
    });
    return;
  }

  // POST /api/memory/:id/key-events — 手动追加关键剧情
  m = /^\/api\/memory\/([\w\u4e00-\u9fa5-]+)\/key-events$/.exec(p);
  if (m && req.method === 'POST') {
    readBody((body) => {
      try { memory.appendKeyEvent(m[1], body.event || ''); send(200, { ok: true }); }
      catch (err) { send(500, { ok: false, err: err.message }); }
    });
    return;
  }

  // GET /api/memory/:id/persona（兼容旧版单文件人设）
  m = /^\/api\/memory\/([\w\u4e00-\u9fa5-]+)\/persona$/.exec(p);
  if (m && req.method === 'GET') return send(200, { ok: true, persona: memory.getPersona(m[1]) });
  if (m && req.method === 'PUT') {
    readBody((body) => {
      try { memory.savePersona(m[1], body.persona || ''); send(200, { ok: true }); }
      catch (err) { send(500, { ok: false, err: err.message }); }
    });
    return;
  }

  // GET /api/memory/:id/sessions
  m = /^\/api\/memory\/([\w\u4e00-\u9fa5-]+)\/sessions$/.exec(p);
  if (m && req.method === 'GET') return send(200, { ok: true, sessions: memory.getRecentSessions(m[1], 200), lastSender: memory.getLastSender(m[1]) });

  // DELETE /api/memory/:id/sessions
  if (m && req.method === 'DELETE') {
    try { memory.clearSessions(m[1]); send(200, { ok: true }); }
    catch (err) { send(500, { ok: false, err: err.message }); }
  }

  // ---- 模型测试 ----
  // POST /api/models/:id/test — 用一句简单请求验证连通
  m = /^\/api\/models\/([\w\u4e00-\u9fa5-]+)\/test$/.exec(p);
  if (m && req.method === 'POST') {
    const cfg = app.getConfig();
    const model = cfg.models.find((x) => x.id === m[1]);
    if (!model) return send(404, { ok: false, err: '模型不存在' });
    const apiKey = model.apiKey || app.env[model.apiKeyEnv];
    if (!apiKey) return send(400, { ok: false, err: '该模型的 API Key 未配置（直接填 Key，或在 .env 设置对应变量）' });
    models.chat(model, [{ role: 'user', content: 'ping' }], { apiKey, maxTokens: 32 })
      .then((reply) => send(200, { ok: true, reply: reply.slice(0, 200) }))
      .catch((err) => send(200, { ok: false, err: err.message }));
    return;
  }

  // ---- 机器人重启 ----
  // POST /api/bots/:id/restart
  m = /^\/api\/bots\/([\w\u4e00-\u9fa5-]+)\/restart$/.exec(p);
  if (m && req.method === 'POST') {
    const cfg = app.getConfig();
    const bot = cfg.bots.find((x) => x.id === m[1]);
    if (!bot) return send(404, { ok: false, err: '机器人不存在' });
    app.bots.stop(m[1]);
    app.bots.start(bot);
    send(200, { ok: true });
    return;
  }

  // ---- 机器人主动发消息 ----
  // POST /api/bots/:id/send { scene:'c2c'|'group'|'guild', targetId, content }
  m = /^\/api\/bots\/([\w\u4e00-\u9fa5-]+)\/send$/.exec(p);
  if (m && req.method === 'POST') {
    const cfg = app.getConfig();
    const bot = cfg.bots.find((x) => x.id === m[1]);
    if (!bot) return send(404, { ok: false, err: '机器人不存在' });
    readBody((body) => {
      const { scene = 'c2c', targetId, content } = body || {};
      if (!targetId || !content) return send(400, { ok: false, err: '缺少 targetId 或 content' });
      app.bots.send(bot, scene, String(targetId), String(content).slice(0, 4000), '')
        .then(() => send(200, { ok: true }))
        .catch((err) => send(200, { ok: false, err: err.message }));
    });
    return;
  }

  // ---- 打开记忆文件夹 ----
  // POST /api/bots/:id/open-folder — 在系统文件管理器中打开该机器人的记忆目录
  m = /^\/api\/bots\/([\w\u4e00-\u9fa5-]+)\/open-folder$/.exec(p);
  if (m && req.method === 'POST') {
    const dir = memory.memoryDir(m[1]);
    fs.mkdirSync(dir, { recursive: true });
    // explorer 是单实例进程，直接 exec 会因退出码非 0 误报失败，改用 spawn 不等待退出码
    const child = spawn(process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open', [dir], { detached: true, stdio: 'ignore' });
    child.on('error', (err) => send(500, { ok: false, err: '打开文件夹失败: ' + err.message }));
    child.unref();
    send(200, { ok: true });
    return;
  }

  // ---- AI 自动归档记忆 ----
  // POST /api/bots/:id/ingest { text } — 概述新剧情/内容，AI 归类写入对应记忆文件
  m = /^\/api\/bots\/([\w\u4e00-\u9fa5-]+)\/ingest$/.exec(p);
  if (m && req.method === 'POST') {
    const cfg = app.getConfig();
    const bot = cfg.bots.find((x) => x.id === m[1]);
    if (!bot) return send(404, { ok: false, err: '机器人不存在' });
    readBody((body) => {
      const text = (body.text || '').trim();
      if (!text) return send(400, { ok: false, err: '缺少 text' });
      const model = cfg.models.find((x) => x.id === bot.modelId) || cfg.models[0];
      if (!model) return send(400, { ok: false, err: '该机器人未绑定模型' });
      const apiKey = model.apiKey || app.env[model.apiKeyEnv];
      if (!apiKey) return send(400, { ok: false, err: '模型未配置 API Key' });
      (async () => {
        const files = memory.getMemoryFiles(bot.id).filter((f) => f.enabled);
        if (!files.length) return send(400, { ok: false, err: '没有可用的记忆文件' });
        const listDesc = files.map((f) => `- ${f.key}（${f.name}）：${f.desc}`).join('\n');
        const sys = `你是记忆整理助手。用户会提供一段新信息（剧情进展、人物设定、特征、知识等），你需要把它归类到合适的记忆文件，并改写为简洁条目。
可用记忆文件（只允许写入以下已启用的文件）：
${listDesc}
规则：
1. 判断新信息归属哪个文件；可以拆分成多条分别归档到不同文件。
2. 输出一个或多个 JSON 对象，每行一个（不要任何其他文字，不要 markdown 代码块），格式：{"file":"<上面某个key>","append":true,"content":"<简洁的条目内容>"}
3. content 中不要出现英文双引号，保持纯文本。
4. append=true 表示在文件末尾追加一条。若新信息是对现有设定的整体替换（如角色状态彻底改变），可输出 append:false 且 content 为完整的替换内容（谨慎，勿覆盖无关内容）。`;
        const reply = await models.chat(model, [{ role: 'system', content: sys }, { role: 'user', content: text }], { apiKey, maxTokens: 500 });
        const parsed = extractJsonObjects(reply);
        const enabledMap = new Map(files.map((f) => [f.key, f]));
        const results = [];
        for (const obj of parsed) {
          if (!obj || !obj.file || !obj.content) continue;
          const target = enabledMap.get(obj.file);
          if (!target) continue;
          if (obj.append === false) memory.saveMemoryFile(bot.id, target.key, String(obj.content));
          else memory.appendMemoryFile(bot.id, target.key, String(obj.content));
          results.push({ file: target.key, name: target.name, action: obj.append === false ? '覆盖' : '追加', content: String(obj.content) });
        }
        if (!results.length) {
          return send(200, { ok: false, err: 'AI 返回格式无法解析: ' + String(reply).slice(0, 200) });
        }
        for (const r of results) console.log(`[bot:${bot.id}] AI 归档 → ${r.file}（${r.action}）: ${r.content.slice(0, 60)}`);
        send(200, { ok: true, results });
      })().catch((err) => send(200, { ok: false, err: err.message }));
    });
    return;
  }

  // ---- 面板直接对话 ----
  // POST /api/bots/:id/chat { content } — 不经过 QQ，直接与机器人（当前模型+记忆）对话
  m = /^\/api\/bots\/([\w\u4e00-\u9fa5-]+)\/chat$/.exec(p);
  if (m && req.method === 'POST') {
    readBody((body) => {
      const content = (body.content || '').trim();
      if (!content) return send(400, { ok: false, err: '缺少 content' });
      (async () => {
        memory.appendSession(m[1], 'user', content);
        const reply = await chatWithBot(m[1], content);
        if (!reply) return send(200, { ok: false, err: '模型返回为空' });
        memory.appendSession(m[1], 'assistant', reply);
        send(200, { ok: true, reply });
      })().catch((err) => send(200, { ok: false, err: err.message }));
    });
    return;
  }

  send(404, { ok: false, err: '接口不存在: ' + p });
}

const cfg = store.getConfig();
const PORT = cfg.port || 4357;
server.listen(PORT, '127.0.0.1', () => {
  console.log('==========================================');
  console.log('  QQ 机器人管理面板');
  console.log(`  面板地址: http://127.0.0.1:${PORT}`);
  console.log('==========================================');
  app.bots.sync(cfg);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n正在停止所有机器人...');
  app.bots.stopAll();
  server.close();
  process.exit(0);
});