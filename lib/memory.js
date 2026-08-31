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
const FILE_TYPES = [
  { key: 'persona',     name: '人格',      desc: '名字、性格、说话风格' },
  { key: 'plot',        name: '剧情',      desc: '剧情背景、世界观设定' },
  { key: 'content',     name: '内容',      desc: '知识、资料、内容储备' },
  { key: 'traits',      name: '特征',      desc: '外貌、能力、喜好等特征' },
  { key: 'key_events',  name: '关键剧情记录', desc: '动态追加的关键事件（AI 对话中自动记录）' },
];

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
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)); } catch {}
  // 确保预设文件存在
  for (const f of FILE_TYPES) if (!names.includes(f.key)) readMemoryFile(botId, f.key);
  names = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
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

// 组装 system prompt（目录下所有记忆文件按序拼接，作为 AI 系统提示）
function buildSystemPrompt(botId) {
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
  const parts = [];
  for (const fn of files) {
    const key = fn.slice(0, -3);
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

module.exports = {
  FILE_TYPES, memoryDir, getMemoryFiles, readMemoryFile, saveMemoryFile, deleteMemoryFile, appendMemoryFile, appendKeyEvent,
  getFileEnabled, setFileEnabled, buildSystemPrompt, getPersona, savePersona,
  appendSession, getRecentSessions, clearSessions, saveLastSender, getLastSender,
};
