// 记忆中心：每个机器人一套多文件记忆库（独立目录 memory/<botId>/）
// ------------------------------------------------------------------
// 文件分类：
//   persona.md      人格 —— 名字、性格、说话风格
//   plot.md         剧情 —— 剧情背景、世界观设定
//   content.md      内容 —— 知识、资料、内容储备
//   traits.md       特征 —— 外貌、能力、喜好等特征
//   key_events.md   关键剧情记录 —— 动态追加的关键事件
// 会话记录：sessions.jsonl（独立读写区）
// ------------------------------------------------------------------
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MEMORY_DIR = path.join(ROOT, 'memory');

// 记忆文件定义（顺序即 system prompt 组装顺序）
// 注：用户设定已迁移为全局设定（memory/global_user.md，设置页管理），不再作为机器人记忆文件
const FILE_TYPES = [
  { key: 'persona',     name: '人格',      desc: '名字、性格、说话风格' },
  { key: 'plot',        name: '剧情',      desc: '剧情背景、世界观设定' },
  { key: 'content',     name: '内容',      desc: '知识、资料、内容储备' },
  { key: 'traits',      name: '特征',      desc: '外貌、能力、喜好等特征' },
  { key: 'key_events',  name: '关键剧情记录', desc: '动态追加的关键事件（AI 对话中自动记录）' },
];

// 已迁移到全局设定的旧记忆文件 key（即使磁盘上存在 user.md 也不再展示/读取）
const MIGRATED_KEYS = new Set(['user']);

const DEFAULTS = {
  persona: `# 人格

## 基本信息
- 名字：（给机器人起个名字）

## 性格特点
-

## 说话风格
-
`,
  plot: `# 剧情

## 剧情背景
-

## 世界观设定
-

## 当前所处阶段
-
`,
  content: `# 内容

## 知识储备
-

## 参考资料
-

## 需要输出/展示的内容
-
`,
  traits: `# 特征

## 外貌特征
-

## 能力特长
-

## 喜好与习惯
-
`,
  key_events: `# 关键剧情记录

（对话中出现关键剧情变化时，会自动追加到这里）
`,
};

function botDir(botId) {
  const dir = path.join(MEMORY_DIR, botId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function filePath(botId, key) {
  return path.join(botDir(botId), `${key}.md`);
}

function memoryDir(botId) {
  return botDir(botId);
}

// ---------- 文件启用/禁用状态（存于 _meta.json，不占 .md 空间） ----------
function metaFile(botId) {
  return path.join(botDir(botId), '_meta.json');
}

function getMeta(botId) {
  try {
    const f = metaFile(botId);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) || { files: {} };
  } catch {}
  return { files: {} };
}

function saveMeta(botId, meta) {
  fs.writeFileSync(metaFile(botId), JSON.stringify(meta, null, 2), 'utf8');
}

function getFileEnabled(botId, key) {
  const meta = getMeta(botId);
  return meta.files[key]?.enabled !== false; // 默认启用
}

function setFileEnabled(botId, key, enabled) {
  assertSafeKey(key);
  const meta = getMeta(botId);
  meta.files[key] = { ...(meta.files[key] || {}), enabled: enabled !== false };
  saveMeta(botId, meta);
  return true;
}

// 校验记忆文件 key 只允许安全字符（字母/数字/下划线/中文/连字符，防止路径穿越）
const KEY_RE = /^[\w\u4e00-\u9fa5-]{1,64}$/;
function assertSafeKey(key) {
  if (!KEY_RE.test(key)) throw new Error(`非法的记忆文件名: ${key}`);
}

// 读取记忆文件（不存在则初始化默认模板）
function readMemoryFile(botId, key) {
  assertSafeKey(key);
  const def = DEFAULTS[key];
  const file = filePath(botId, key);
  if (!fs.existsSync(file) && def !== undefined) fs.writeFileSync(file, def, 'utf8');
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8');
}

function saveMemoryFile(botId, key, content) {
  assertSafeKey(key);
  fs.writeFileSync(filePath(botId, key), content ?? '', 'utf8');
  return true;
}

// 删除记忆文件（预设模板文件也可删，重新读取时会恢复默认）
function deleteMemoryFile(botId, key) {
  assertSafeKey(key);
  const file = filePath(botId, key);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return true;
}

// 扫描目录下全部 .md 记忆文件（支持用户自定义命名，不限于预设 5 个）
// 返回排序后的 [{ key, name, desc, content }]
function getMemoryFiles(botId) {
  const dir = botDir(botId);
  const mdOnly = (f) => f.endsWith('.md');
  let names = [];
  try { names = fs.readdirSync(dir).filter(mdOnly).map((f) => f.slice(0, -3)); } catch {}
  // 确保预设文件存在
  for (const f of FILE_TYPES) if (!names.includes(f.key)) readMemoryFile(botId, f.key);
  names = fs.readdirSync(dir).filter(mdOnly).map((f) => f.slice(0, -3));
  // 剔除已迁移到全局设定的旧文件（如 user.md）
  names = names.filter((n) => !MIGRATED_KEYS.has(n));
  // 排序：预设在前（按定义顺序），自定义按名称
  names.sort((a, b) => {
    const ia = FILE_TYPES.findIndex((f) => f.key === a);
    const ib = FILE_TYPES.findIndex((f) => f.key === b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'zh-CN');
  });
  return names.map((key) => {
    const preset = FILE_TYPES.find((f) => f.key === key);
    return {
      key,
      name: preset ? preset.name : key,
      desc: preset ? preset.desc : '自定义记忆文件（内容将随 system prompt 提供给 AI）',
      content: fs.readFileSync(path.join(dir, `${key}.md`), 'utf8'),
      enabled: getFileEnabled(botId, key),
    };
  });
}

// 追加内容到记忆文件（AI 自动归档时使用）
function appendMemoryFile(botId, key, content) {
  assertSafeKey(key);
  const text = content.trim();
  if (!text) return false;
  const file = filePath(botId, key);
  const prefix = fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim() ? '\n' : '';
  fs.appendFileSync(file, prefix + text + '\n', 'utf8');
  return true;
}

// 追加关键剧情记录（带时间戳）
function appendKeyEvent(botId, event) {
  const t = event.trim();
  if (!t) return false;
  const file = filePath(botId, 'key_events');
  const ts = new Date().toLocaleString('zh-CN', { hour12: false });
  const line = `- [${ts}] ${t}`;
  fs.appendFileSync(file, line + '\n', 'utf8');
  return true;
}

// 组装 system prompt
// opts.useGlobal !== false 时，先拼全局设定（多文件，仅启用的），再拼该机器人记忆库文件
function buildSystemPrompt(botId, opts = {}) {
  const parts = [];
  if (opts.useGlobal !== false) {
    for (const gf of getGlobalFiles()) {
      if (!gf.enabled) continue;
      const gc = gf.content.trim();
      if (!gc) continue;
      parts.push(`【全局·${gf.name}】\n${gc}`);
    }
  }
  const dir = botDir(botId);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch {}
  // 排序：预设在前，自定义按名称
  files.sort((a, b) => {
    const ka = a.slice(0, -3), kb = b.slice(0, -3);
    const ia = FILE_TYPES.findIndex((f) => f.key === ka);
    const ib = FILE_TYPES.findIndex((f) => f.key === kb);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return ka.localeCompare(kb, 'zh-CN');
  });
  for (const fn of files) {
    const key = fn.slice(0, -3);
    // 跳过已迁移到全局设定的旧文件（如 user.md）
    if (MIGRATED_KEYS.has(key)) continue;
    // 跳过已禁用的文件
    if (!getFileEnabled(botId, key)) continue;
    let content = '';
    try { content = fs.readFileSync(path.join(dir, fn), 'utf8').trim(); } catch { continue; }
    if (!content) continue;
    if (key === 'key_events') {
      // 关键剧情：只取有内容的条目，避免空模板头
      const lines = content.split('\n').filter((l) => /^- \[/.test(l)).map((l) => l.replace(/^- /, ''));
      if (lines.length) parts.push(`【关键剧情记录】\n${lines.join('\n')}`);
    } else {
      const preset = FILE_TYPES.find((f) => f.key === key);
      parts.push(`【${preset ? preset.name : key}】\n${content}`);
    }
  }
  if (!parts.length) return readMemoryFile(botId, 'persona');
  return parts.join('\n\n');
}

// 兼容旧接口：单文件人设（返回 persona.md 内容）
function getPersona(botId) {
  return readMemoryFile(botId, 'persona');
}
function savePersona(botId, content) {
  return saveMemoryFile(botId, 'persona', content);
}

// 会话记录：追加一条 {role, content, ts}
function appendSession(botId, role, content) {
  const file = path.join(botDir(botId), 'sessions.jsonl');
  fs.appendFileSync(file, JSON.stringify({ role, content, ts: Date.now() }) + '\n', 'utf8');
}

// ---------- 全局设定（设置页管理：多文件 + 开关，存于 memory/global/） ----------
const GLOBAL_DIR = path.join(MEMORY_DIR, 'global');

// 全局预设文件定义（顺序即 system prompt 组装顺序）
const GLOBAL_TYPES = [
  { key: 'user',   name: '用户设定',   desc: '告知 AI 用户情况 / 角色扮演身份' },
  { key: 'prompt', name: '全局提示词', desc: '所有机器人默认遵循的提示词' },
];
const GLOBAL_DEFAULTS = {
  user: `# 用户设定

## 用户身份
-

## 对话偏好
-

## 角色扮演：用户扮演的角色
-
`,
  prompt: `# 全局提示词

这里是所有机器人都默认遵循的提示词（如通用回复风格、禁忌等）。
`,
};

// 迁移旧版单文件全局设定（memory/global_user.md、global_prompt.md → memory/global/user.md、prompt.md）
function migrateGlobalFile(oldName, key) {
  const old = path.join(MEMORY_DIR, oldName);
  const target = path.join(GLOBAL_DIR, `${key}.md`);
  if (!fs.existsSync(target) && fs.existsSync(old)) {
    try {
      fs.copyFileSync(old, target);
      fs.unlinkSync(old);
      console.log(`[memory] 已迁移全局文件 ${oldName} → global/${key}.md`);
    } catch (e) { console.log('[memory] 全局文件迁移失败:', e.message); }
  }
}

function globalDir() {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  migrateGlobalFile('global_user.md', 'user');
  migrateGlobalFile('global_prompt.md', 'prompt');
  return GLOBAL_DIR;
}

function globalMetaFile() {
  return path.join(GLOBAL_DIR, '_meta.json');
}
function getGlobalMeta() {
  try {
    const f = globalMetaFile();
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) || { files: {} };
  } catch {}
  return { files: {} };
}
function saveGlobalMeta(meta) {
  fs.writeFileSync(globalMetaFile(), JSON.stringify(meta, null, 2), 'utf8');
}
function getGlobalFileEnabled(key) {
  const meta = getGlobalMeta();
  return meta.files[key]?.enabled !== false; // 默认启用
}
function setGlobalFileEnabled(key, enabled) {
  assertSafeKey(key);
  const meta = getGlobalMeta();
  meta.files[key] = { ...(meta.files[key] || {}), enabled: enabled !== false };
  saveGlobalMeta(meta);
  return true;
}

// 读取全局文件（不存在则初始化默认模板）
function readGlobalFile(key) {
  assertSafeKey(key);
  const def = GLOBAL_DEFAULTS[key];
  const file = path.join(GLOBAL_DIR, `${key}.md`);
  if (!fs.existsSync(file) && def !== undefined) fs.writeFileSync(file, def, 'utf8');
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8');
}
function saveGlobalFile(key, content) {
  assertSafeKey(key);
  fs.writeFileSync(path.join(GLOBAL_DIR, `${key}.md`), content ?? '', 'utf8');
  return true;
}
function deleteGlobalFile(key) {
  assertSafeKey(key);
  const file = path.join(GLOBAL_DIR, `${key}.md`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return true;
}

// 列出全部全局文件（预设在前，自定义按名称），含启用状态与内容
function getGlobalFiles() {
  const dir = globalDir();
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)); } catch {}
  for (const f of GLOBAL_TYPES) if (!names.includes(f.key)) readGlobalFile(f.key);
  names = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
  names.sort((a, b) => {
    const ia = GLOBAL_TYPES.findIndex((f) => f.key === a);
    const ib = GLOBAL_TYPES.findIndex((f) => f.key === b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'zh-CN');
  });
  return names.map((key) => {
    const preset = GLOBAL_TYPES.find((f) => f.key === key);
    return {
      key,
      name: preset ? preset.name : key,
      desc: preset ? preset.desc : '自定义全局文件（勾选「采用全局设定」的机器人将一并读取）',
      content: fs.readFileSync(path.join(dir, `${key}.md`), 'utf8'),
      enabled: getGlobalFileEnabled(key),
    };
  });
}

// 兼容旧接口：全局用户设定 / 全局提示词（映射到 user / prompt 两个全局文件）
function getGlobalUser() { return readGlobalFile('user'); }
function saveGlobalUser(content) { return saveGlobalFile('user', content); }
function getGlobalPrompt() { return readGlobalFile('prompt'); }
function saveGlobalPrompt(content) { return saveGlobalFile('prompt', content); }

// ---------- Token 用量统计 ----------
const USAGE_FILE = path.join(MEMORY_DIR, 'usage.jsonl');

// 记录一次模型调用用量。任何调用都会记录一条（含失败的），保证调用次数与消耗接近实际。
// info: { usage(模型返回的精确用量，可能为 null), promptTokens(本地估算兜底), ok(是否成功) }
// 优先使用模型返回的精确 usage；失败或缺失时用本地估算兜底。
function recordUsage(botId, modelId, info = {}) {
  const usage = info.usage || {};
  const norm = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
  const prompt = norm(usage.prompt_tokens) || norm(info.promptTokens);
  const completion = norm(usage.completion_tokens);
  const total = norm(usage.total_tokens) || (prompt + completion);
  fs.appendFileSync(USAGE_FILE, JSON.stringify({
    ts: Date.now(),
    botId: String(botId || '未知'),
    modelId: String(modelId || '未知'),
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    ok: info.ok !== false,
  }) + '\n', 'utf8');
}

// 汇总统计：累计 / 今日 / 按机器人 / 按模型 / 近 14 天
function getUsageStats() {
  const rows = [];
  if (fs.existsSync(USAGE_FILE)) {
    for (const l of fs.readFileSync(USAGE_FILE, 'utf8').split('\n')) {
      const t = l.trim();
      if (!t) continue;
      try { rows.push(JSON.parse(t)); } catch {}
    }
  }
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();
  const add = (o, r) => {
    o.calls++;
    if (r.ok === false) o.failed++;
    else o.ok++;
    o.prompt += r.promptTokens || 0; o.completion += r.completionTokens || 0; o.total += r.totalTokens || 0;
  };
  const total = { calls: 0, ok: 0, failed: 0, prompt: 0, completion: 0, total: 0 };
  const today = { calls: 0, ok: 0, failed: 0, prompt: 0, completion: 0, total: 0 };
  const byBot = new Map();
  const byModel = new Map();
  const byDay = new Map();
  for (const r of rows) {
    add(total, r);
    if (r.ts >= todayTs) add(today, r);
    const b = byBot.get(r.botId) || { botId: r.botId, calls: 0, ok: 0, failed: 0, prompt: 0, completion: 0, total: 0 };
    add(b, r); byBot.set(r.botId, b);
    const m = byModel.get(r.modelId) || { modelId: r.modelId, calls: 0, ok: 0, failed: 0, prompt: 0, completion: 0, total: 0 };
    add(m, r); byModel.set(r.modelId, m);
    const d = new Date(r.ts);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const day = byDay.get(dateStr) || { date: dateStr, total: 0 };
    day.total += r.totalTokens || 0; byDay.set(dateStr, day);
  }
  // 近 14 天补零
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push(byDay.get(dateStr) || { date: dateStr, total: 0 });
  }
  const sortDesc = (a, b) => b.total - a.total;
  return {
    total,
    today,
    byBot: [...byBot.values()].sort(sortDesc),
    byModel: [...byModel.values()].sort(sortDesc),
    byDay: days,
  };
}

// 读取最近 N 条会话（用于给 AI 提供上下文）
function getRecentSessions(botId, limit = 10) {
  const file = path.join(botDir(botId), 'sessions.jsonl');
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// 清空会话
function clearSessions(botId) {
  const file = path.join(botDir(botId), 'sessions.jsonl');
  if (fs.existsSync(file)) fs.writeFileSync(file, '', 'utf8');
  return true;
}

// 记录最近一个与机器人对话的用户 openid（方便面板主动发消息）
function saveLastSender(botId, sender) {
  if (!sender) return;
  fs.writeFileSync(path.join(botDir(botId), 'last_sender.json'), JSON.stringify({ sender, ts: Date.now() }), 'utf8');
}

function getLastSender(botId) {
  const file = path.join(botDir(botId), 'last_sender.json');
  try {
    if (!fs.existsSync(file)) return '';
    return JSON.parse(fs.readFileSync(file, 'utf8')).sender || '';
  } catch { return ''; }
}

// 主 ID：机器人与用户的第一个对话者 openid（只记录第一次，不覆盖）
function saveMasterSender(botId, sender) {
  if (!sender) return;
  if (getMasterSender(botId)) return; // 已有主 ID 则保持不变
  fs.writeFileSync(path.join(botDir(botId), 'master_sender.json'), JSON.stringify({ sender, ts: Date.now() }), 'utf8');
}

function getMasterSender(botId) {
  const file = path.join(botDir(botId), 'master_sender.json');
  try {
    if (!fs.existsSync(file)) return '';
    return JSON.parse(fs.readFileSync(file, 'utf8')).sender || '';
  } catch { return ''; }
}

module.exports = {
  FILE_TYPES, memoryDir, getMemoryFiles, readMemoryFile, saveMemoryFile, deleteMemoryFile, appendMemoryFile, appendKeyEvent,
  getFileEnabled, setFileEnabled, buildSystemPrompt, getPersona, savePersona,
  appendSession, getRecentSessions, clearSessions,
  getGlobalUser, saveGlobalUser, getGlobalPrompt, saveGlobalPrompt,
  getGlobalFiles, readGlobalFile, saveGlobalFile, deleteGlobalFile, getGlobalFileEnabled, setGlobalFileEnabled,
  recordUsage, getUsageStats,
  saveLastSender, getLastSender, saveMasterSender, getMasterSender,
};
