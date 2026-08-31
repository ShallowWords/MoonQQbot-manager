// QQBOT 控制台 — 前端逻辑（左侧导航 + 主区上下文）
'use strict';

let state = null;            // { bots, models }
let view = { type: 'bot', id: null };   // 当前视图
let lastSender = '';         // 最近一次消息发送者（方便主动回复）

const $ = (s) => document.querySelector(s);
const main = $('#main');

const STATUS_MAP = { '已连接': 'ok', '连接中': 'warn', '未配置': 'warn', '未启动': 'warn', '已断开': 'err', '错误': 'err', '初始化失败': 'err' };

// ---------- 基础工具 ----------
async function api(url, method = 'GET', body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  try {
    const res = await fetch(url, opts);
    return await res.json();
  } catch {
    return { ok: false, err: '网络错误' };
  }
}

function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.className = 'toast', 2400);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function badge(status) {
  const cls = STATUS_MAP[status] || 'warn';
  return `<span class="badge ${cls}"><span class="dot"></span>${esc(status || '未知')}</span>`;
}

// ---------- 状态加载 ----------
async function loadState(keepView = true) {
  state = await api('/api/state');
  if (state.ok) {
    $('#status-dot').className = 'dot on';
    $('#conn-text').textContent = '后端已连接';
  } else {
    $('#status-dot').className = 'dot off';
    $('#conn-text').textContent = '连接失败';
  }
  // 校验当前选中项仍存在
  if (view.type === 'bot' && view.id && !(state.bots || []).some(b => b.id === view.id)) view = { type: 'bot', id: null };
  if (view.type === 'model' && view.id && !(state.models || []).some(m => m.id === view.id)) view = { type: 'bot', id: null };
  if (!view.id && (view.type === 'bot') && (state.bots || []).length) view = { type: 'bot', id: state.bots[0].id };
  renderSidebar();
  renderMain();
}

// ---------- 左侧导航 ----------
function renderSidebar() {
  const bots = state.bots || [];
  const models = state.models || [];
  $('#bot-list').innerHTML = bots.length
    ? bots.map(b => `
      <div class="side-item ${view.type === 'bot' && view.id === b.id ? 'active' : ''}" onclick="selectBot('${b.id}')">
        <span class="dot ${STATUS_MAP[b.runtime?.status] || 'warn'}"></span>
        <span class="side-name">${esc(b.name || b.id)}</span>
        ${b.enabled ? '' : '<span class="side-model">停用</span>'}
      </div>`).join('')
    : '<div class="side-empty">暂无机器人</div>';
  $('#model-list').innerHTML = models.length
    ? models.map(m => `
      <div class="side-item ${view.type === 'model' && view.id === m.id ? 'active' : ''}" onclick="selectModel('${m.id}')">
        <span class="side-name">${esc(m.name || m.id)}</span>
        <span class="side-model ${m.hasKey ? '' : 'nokey'}">${m.hasKey ? '✓' : '!key'}</span>
      </div>`).join('')
    : '<div class="side-empty">暂无模型</div>';
}

function selectBot(id) { view = { type: 'bot', id }; renderSidebar(); renderMain(); }
function selectModel(id) { view = { type: 'model', id }; renderSidebar(); renderMain(); }

// ---------- 主区渲染 ----------
let _sessionTimer = null;
function clearSessionTimer() {
  if (_sessionTimer) { clearInterval(_sessionTimer); _sessionTimer = null; }
}

function renderMain() {
  clearSessionTimer(); // 切换视图时停止旧的会话轮询
  if (view.type === 'bot-form') return renderBotForm(view.id);
  if (view.type === 'model-form') return renderModelForm(view.id);
  if (view.type === 'model') return renderModelDetail(view.id);
  return renderBotDetail(view.id);
}

// ================= 机器人详情 =================
let _botEditing = false;
function toggleBotEdit() { _botEditing = !_botEditing; renderMain(); }

// 头像渲染：URL 图片 / 本地 /avatars 图片 / emoji / 名称首字
function avatarInner(b) {
  const a = b.avatar || '';
  if (/^(https?:\/\/|\/)/i.test(a)) return `<img src="${esc(a)}" alt="" onerror="this.style.visibility='hidden'">`;
  if (a) return esc(a);
  return esc((b.name || b.id || 'B').slice(0, 1));
}

function renderBotDetail(id) {
  const b = (state.bots || []).find(x => x.id === id);
  if (!b) {
    main.innerHTML = `<div class="card"><div class="empty-hint">选择一个机器人，或点击左侧 ＋ 添加。</div></div>`;
    return;
  }
  const models = state.models || [];
  const modelOpts = models.map(m => `<option value="${m.id}" ${m.id === b.modelId ? 'selected' : ''}>${esc(m.name || m.id)}</option>`).join('') || '<option value="">未绑定</option>';
  const modelName = (models.find(m => m.id === b.modelId) || {}).name || b.modelId || '未绑定';

  const editForm = _botEditing ? `
    <div class="card profile-card editing">
      <div class="card-title">编辑机器人
        <span class="spacer"></span>
        <button class="ghost sm" onclick="toggleBotEdit()">取消</button>
        <button class="primary sm" onclick="saveBot('${b.id}')">保存</button>
      </div>
      <div class="profile-edit-head">
        <div class="avatar avatar-preview" id="avatar-preview">${avatarInner(b)}</div>
        <div class="frm-row" style="flex:1;margin:0">
          <label class="frm">头像：图片 URL / emoji / 本地图片（上传后保存到项目 avatars/ 目录）</label>
          <input id="f-avatar" type="text" value="${esc(b.avatar || '')}" placeholder="https://... 或 🤖 或点击选择本地图片">
          <div style="margin-top:6px;display:flex;gap:8px">
            <button class="sm" type="button" onclick="pickAvatarFile()">📁 选择本地图片</button>
          </div>
        </div>
        <input type="file" id="f-avatar-file" accept="image/*" style="display:none" onchange="uploadAvatar('${b.id}')">
      </div>
      <div class="grid-3">
        <div class="field"><label>名称</label><input id="f-name" type="text" value="${esc(b.name || '')}"></div>
        <div class="field"><label>AppID</label><input id="f-appid" type="text" value="${esc(b.appId || '')}"></div>
        <div class="field"><label>AppSecret（env: 变量或直接填）</label><input id="f-secret" type="password" value="${esc(b.appSecret || '')}"></div>
      </div>
      <div class="grid-3" style="margin-top:12px">
        <div class="field"><label>绑定模型</label><select id="f-model">${modelOpts}</select></div>
        <div class="field"><label>历史记忆条数</label><input id="f-history" type="number" value="${b.historyLimit || 10}"></div>
        <div class="field"><label>运行环境</label><select id="f-sandbox">
          <option value="true" ${b.sandbox !== false ? 'selected' : ''}>沙箱（测试）</option>
          <option value="false" ${b.sandbox === false ? 'selected' : ''}>正式</option>
        </select></div>
      </div>
    </div>
  ` : `
    <div class="card profile-card">
      <div class="profile-head">
        <div class="avatar">${avatarInner(b)}</div>
        <div class="profile-info">
          <div class="profile-name">${esc(b.name || b.id)} ${badge(b.runtime?.status)}</div>
          <div class="profile-sub">${esc(b.id)} · AppID ${esc(b.appId || '-')} · ${b.sandbox !== false ? '沙箱' : '正式'}</div>
        </div>
        <button class="ghost sm edit-btn" onclick="toggleBotEdit()" title="编辑">✎ 编辑</button>
      </div>
      <div class="profile-grid">
        <div class="pg-item"><label>绑定模型</label><div>${esc(modelName)}</div></div>
        <div class="pg-item"><label>历史记忆</label><div>${b.historyLimit || 10} 条</div></div>
        <div class="pg-item"><label>Key 引用</label><div>${esc(b.appSecret ? (b.appSecret.length > 18 ? b.appSecret.slice(0, 18) + '…' : b.appSecret) : '-')}</div></div>
        <div class="pg-item"><label>记忆文件数</label><div id="pg-filecount">…</div></div>
      </div>
    </div>
  `;

  main.innerHTML = `
    <div class="page-head">
      <h2>${esc(b.name || b.id)}</h2>
      <span class="spacer"></span>
      <button class="ghost sm" onclick="restartBot('${b.id}')">↻ 重连</button>
      <button class="ghost sm" onclick="delBot('${b.id}')">删除</button>
    </div>

    ${editForm}

    <div class="cards-2">
      <div class="card mem-card">
        <div class="card-title">记忆库（memory/${esc(b.id)}/）
          <span class="spacer"></span>
          <button class="ghost sm" onclick="openFolder('${b.id}')">打开文件夹</button>
          <button class="ghost sm" onclick="newMemoryFile('${b.id}')">＋ 新增文件</button>
        </div>
        <div class="mem-files" id="mem-files"></div>
        <div class="ingest-box">
          <textarea id="f-ingest" rows="1" placeholder="概述新剧情 / 内容，AI 自动归类写入对应记忆文件…"></textarea>
          <button class="primary sm" onclick="ingestMemory('${b.id}')">✉ AI 归档</button>
        </div>
      </div>
      <div class="card session-card">
        <div class="card-title">会话记录
          <span class="spacer"></span>
          <button class="danger sm" onclick="clearSessions('${b.id}')">清空</button>
        </div>
        <div class="session-list" id="session-list"><div class="empty-hint">加载中…</div></div>
        <div class="chat-input">
          <textarea id="f-chat" rows="1" placeholder="直接与模型对话（使用当前人设与记忆），Enter 发送，Shift+Enter 换行…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();directChat('${b.id}')}"></textarea>
          <button class="primary sm" onclick="directChat('${b.id}')">发送</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">主动发消息（单聊需填写对方的 openid）</div>
      <div class="send-bar">
        <div class="scene-pick" id="scene-pick">
          <span class="chip active" data-s="c2c" onclick="pickScene(this)">单聊</span>
          <span class="chip" data-s="group" onclick="pickScene(this)">群聊</span>
          <span class="chip" data-s="guild" onclick="pickScene(this)">频道</span>
        </div>
        <div class="frm-row">
          <label class="frm">目标 openid${lastSender ? '（最近发送者：' + esc(lastSender.slice(0, 14)) + '… <a style="color:var(--accent);cursor:pointer" onclick="useLastSender()">填入</a>）' : ''}</label>
          <input id="f-target" type="text" placeholder="如 119F66669BDB820635DB47B413FBA648">
        </div>
        <div class="frm-row">
          <label class="frm">内容</label>
          <input id="f-content" type="text" placeholder="要发送的消息…">
        </div>
        <button class="primary" onclick="sendMsg('${b.id}')">发送</button>
      </div>
    </div>
  `;

  loadMemoryFiles(b.id);
  loadSessions(b.id);

  // 会话自动刷新（仅当仍停留在该机器人视图时）
  clearSessionTimer();
  _sessionTimer = setInterval(() => {
    if (view.type === 'bot' && view.id === b.id && !document.hidden) loadSessions(b.id);
  }, 4000);
}

let _scene = 'c2c';
function pickScene(el) {
  _scene = el.dataset.s;
  document.querySelectorAll('#scene-pick .chip').forEach(c => c.classList.toggle('active', c === el));
}
function useLastSender() { $('#f-target').value = lastSender; }

// ---- 记忆库（文件开关列表 + AI 自动归档） ----
async function loadMemoryFiles(id) {
  const r = await api(`/api/memory/${id}/files`);
  const files = r.files || [];
  renderMemFiles(id, files);
  const pc = $('#pg-filecount');
  if (pc) pc.textContent = files.length + ' 个';
}

function renderMemFiles(id, files) {
  const el = $('#mem-files');
  if (!el) return;
  if (!files.length) { el.innerHTML = '<div class="empty-hint">暂无记忆文件</div>'; return; }
  el.innerHTML = files.map(f => `
    <div class="mem-file ${f.enabled ? '' : 'disabled'}">
      <label class="switch" title="${f.enabled ? '点击禁用' : '点击启用'}">
        <input type="checkbox" ${f.enabled ? 'checked' : ''} onchange="toggleFile('${id}','${f.key}',this.checked)">
        <span class="slider"></span>
      </label>
      <span class="mf-name">${esc(f.name)}</span>
      <span class="mf-desc">${esc(f.desc)}</span>
      <span class="mf-state">${f.enabled ? '启用' : '已禁用'}</span>
      <button class="ghost sm" onclick="delMemoryFile('${id}','${f.key}')" title="删除文件">✕</button>
    </div>`).join('');
}

async function toggleFile(id, key, enabled) {
  const r = await api(`/api/memory/${id}/files/${key}/enabled`, 'PUT', { enabled });
  r.ok ? toast(`已${enabled ? '启用' : '禁用'}「${key}」`, 'ok') : toast(r.err, 'err');
  if (r.ok) loadMemoryFiles(id);
}

// AI 自动归档：概述 → AI 归类写入对应文件
async function ingestMemory(id) {
  const text = $('#f-ingest').value.trim();
  if (!text) return toast('请输入要归档的内容', 'err');
  const btn = document.querySelector('.ingest-box button');
  if (btn) { btn.disabled = true; btn.textContent = 'AI 处理中…'; }
  try {
    const r = await api(`/api/bots/${id}/ingest`, 'POST', { text });
    if (r.ok) {
      const rs = r.results || [];
      toast(`已归档 ${rs.length} 条 → ${rs.map(x => x.name).join('、')}`, 'ok');
      $('#f-ingest').value = '';
      loadMemoryFiles(id);
    } else {
      toast('AI 处理失败: ' + r.err, 'err');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✉ 交给 AI 处理'; }
  }
}

// 在系统文件管理器中打开记忆文件夹
async function openFolder(id) {
  const r = await api(`/api/bots/${id}/open-folder`, 'POST');
  r.ok ? toast('已打开文件夹', 'ok') : toast(r.err, 'err');
}

// ---- 本地头像上传 ----
function pickAvatarFile() {
  const input = $('#f-avatar-file');
  if (input) input.click();
}

async function uploadAvatar(id) {
  const input = $('#f-avatar-file');
  const file = input.files && input.files[0];
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const reader = new FileReader();
  reader.onload = async () => {
    const data = String(reader.result).split(',')[1] || '';
    const r = await api('/api/upload-avatar', 'POST', { botId: id, ext, data });
    if (r.ok) {
      $('#f-avatar').value = r.url;
      const pv = $('#avatar-preview');
      if (pv) pv.innerHTML = `<img src="${esc(r.url)}" alt="">`;
      toast('头像已上传 ✓', 'ok');
    } else {
      toast('上传失败: ' + r.err, 'err');
    }
    input.value = '';
  };
  reader.readAsDataURL(file);
}

// 新建记忆文件（自定义命名）
async function newMemoryFile(id) {
  const name = prompt('新建记忆文件名（如：设定、大纲、角色表…）');
  if (!name) return;
  const key = name.trim().replace(/\.md$/i, '').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
  if (!key) return toast('文件名无效', 'err');
  const r = await api(`/api/memory/${id}/files`, 'POST', { key });
  r.ok ? toast('已创建记忆文件：' + key, 'ok') : toast(r.err, 'err');
  if (r.ok) loadMemoryFiles(id);
}

// 删除记忆文件
async function delMemoryFile(id, key) {
  if (!confirm(`确定删除记忆文件「${key}.md」？`)) return;
  const r = await api(`/api/memory/${id}/files/${key}`, 'DELETE');
  r.ok ? toast('已删除', 'ok') : toast(r.err, 'err');
  if (r.ok) loadMemoryFiles(id);
}
async function loadSessions(id) {
  const r = await api(`/api/memory/${id}/sessions`);
  const list = r.sessions || [];
  if (r.lastSender) lastSender = r.lastSender;
  const el = $('#session-list');
  if (!el) return;
  const html = list.length
    ? list.map(s => `
      <div class="session ${s.role === 'assistant' ? 'bot' : 'user'}">
        <div class="who">${s.role === 'assistant' ? '🤖' : '👤'}</div>
        <div class="bubble md">${md(s.content)}<div class="time">${new Date(s.ts).toLocaleString()}</div></div>
      </div>`).join('')
    : '<div class="empty-hint">暂无会话记录</div>';
  // 内容无变化则不重绘，避免闪烁
  if (el.innerHTML !== html) el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

// ---- 面板直接对话 ----
async function directChat(id) {
  const content = $('#f-chat').value.trim();
  if (!content) return toast('请输入内容', 'err');
  const btn = document.querySelector('.session-card button');
  if (btn) { btn.disabled = true; btn.textContent = '思考中…'; }
  try {
    const r = await api(`/api/bots/${id}/chat`, 'POST', { content });
    if (r.ok) {
      $('#f-chat').value = '';
      loadSessions(id);
    } else {
      toast('对话失败: ' + r.err, 'err');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '发送'; }
  }
}

// ---- 轻量 Markdown 渲染（先转义防 XSS，再转换） ----
function md(s) {
  let h = esc(s);
  // 代码块
  h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => `<pre><code>${code.trim()}</code></pre>`);
  // 标题
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // 粗体 / 斜体
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // 行内代码
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 链接
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // 引用
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // 无序 / 有序列表（成组包 <ul>/<ol>）
  const listRe = /(?:^- .+\n?)+/gm;
  h = h.replace(listRe, (m) => '<ul>' + m.split('\n').map(l => `<li>${l.replace(/^- /, '')}</li>`).join('') + '</ul>');
  const olRe = /(?:^\d+\. .+\n?)+/gm;
  h = h.replace(olRe, (m) => '<ol>' + m.split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('') + '</ol>');
  // 其余行 → 段落
  h = h.replace(/^(?!<\/?(h[1-3]|pre|ul|ol|li|blockquote|p)|$)(.+)$/gm, '<p>$1</p>');
  h = h.replace(/\n+/g, '');
  return h;
}

async function saveBot(id) {
  const bots = (state.bots || []).slice();
  const i = bots.findIndex(x => x.id === id);
  if (i < 0) return;
  bots[i] = {
    ...bots[i],
    name: $('#f-name').value.trim(),
    appId: $('#f-appid').value.trim(),
    appSecret: $('#f-secret').value.trim(),
    avatar: ($('#f-avatar') && $('#f-avatar').value.trim()) || '',
    modelId: $('#f-model').value,
    historyLimit: Number($('#f-history').value) || 10,
    sandbox: $('#f-sandbox').value === 'true',
  };
  const r = await api('/api/config', 'PUT', { bots });
  r.ok ? toast('已保存', 'ok') : toast(r.err, 'err');
  if (r.ok) { _botEditing = false; await loadState(); }
}

async function restartBot(id) {
  const r = await api(`/api/bots/${id}/restart`, 'POST');
  r.ok ? toast('已触发重连', 'ok') : toast(r.err, 'err');
  setTimeout(loadState, 800);
}

async function delBot(id) {
  if (!confirm(`确定删除机器人「${id}」？`)) return;
  const bots = (state.bots || []).filter(x => x.id !== id);
  const r = await api('/api/config', 'PUT', { bots });
  r.ok ? toast('已删除', 'ok') : toast(r.err, 'err');
  await loadState();
}

async function clearSessions(id) {
  if (!confirm('确定清空该机器人全部会话记录？')) return;
  const r = await api(`/api/memory/${id}/sessions`, 'DELETE');
  r.ok ? toast('已清空', 'ok') : toast(r.err, 'err');
  loadSessions(id);
}

async function sendMsg(id) {
  const targetId = $('#f-target').value.trim();
  const content = $('#f-content').value.trim();
  if (!targetId || !content) return toast('请填写目标 openid 和内容', 'err');
  const r = await api(`/api/bots/${id}/send`, 'POST', { scene: _scene, targetId, content });
  r.ok ? toast('消息已发送 ✓', 'ok') : toast('发送失败: ' + r.err, 'err');
  if (r.ok) { $('#f-content').value = ''; loadSessions(id); }
}

// ================= 机器人表单（添加） =================
function renderBotForm(id) {
  const models = state.models || [];
  const modelOpts = models.map(m => `<option value="${m.id}">${esc(m.name || m.id)}</option>`).join('') || '<option value="">先添加模型</option>';
  main.innerHTML = `
    <div class="page-head">
      <h2>添加机器人</h2>
      <span class="spacer"></span>
      <button class="ghost sm" onclick="backToBots()">← 返回</button>
    </div>
    <div class="card">
      <div class="grid-2">
        <div class="field"><label>ID（唯一标识，如 BOT2）</label><input id="f-id" type="text" placeholder="BOT2"></div>
        <div class="field"><label>名称</label><input id="f-name" type="text" placeholder="我的机器人"></div>
      </div>
      <div class="grid-2" style="margin-top:12px">
        <div class="field"><label>AppID</label><input id="f-appid" type="text" placeholder="如 1905280605"></div>
        <div class="field"><label>AppSecret（.env 变量引用或直接填）</label><input id="f-secret" type="password" placeholder="env:QQBOT_SECRET 或密钥"></div>
      </div>
      <div class="grid-3" style="margin-top:12px">
        <div class="field"><label>绑定模型</label><select id="f-model">${modelOpts}</select></div>
        <div class="field"><label>历史记忆条数</label><input id="f-history" type="number" value="10"></div>
        <div class="field"><label>运行环境</label><select id="f-sandbox"><option value="true">沙箱（测试）</option><option value="false">正式</option></select></div>
      </div>
      <div style="margin-top:18px;display:flex;gap:8px">
        <button class="primary" onclick="createBot()">创建</button>
        <button class="ghost" onclick="backToBots()">取消</button>
      </div>
    </div>`;
}

function backToBots() { view = { type: 'bot', id: (state.bots || [])[0]?.id || null }; renderSidebar(); renderMain(); }

async function createBot() {
  const entry = {
    id: $('#f-id').value.trim(),
    name: $('#f-name').value.trim() || $('#f-id').value.trim(),
    appId: $('#f-appid').value.trim(),
    appSecret: $('#f-secret').value.trim(),
    modelId: $('#f-model').value,
    sandbox: $('#f-sandbox').value === 'true',
    enabled: true,
    historyLimit: Number($('#f-history').value) || 10,
    personaFile: '',
    intents: ['GROUP_AND_C2C_EVENT', 'PUBLIC_GUILD_MESSAGES'],
  };
  if (!entry.id) return toast('请填写机器人 ID', 'err');
  if ((state.bots || []).some(b => b.id === entry.id)) return toast('该 ID 已存在', 'err');
  const bots = (state.bots || []).concat(entry);
  const r = await api('/api/config', 'PUT', { bots });
  r.ok ? toast('已创建', 'ok') : toast(r.err, 'err');
  if (r.ok) { view = { type: 'bot', id: entry.id }; await loadState(); }
}

// ================= 模型供应商 =================
const PROVIDERS = {
  siliconflow: {
    name: '硅基流动',
    baseURL: 'https://api.siliconflow.cn/v1',
    env: 'SILICONFLOW_API_KEY',
    models: [
      'deepseek-ai/DeepSeek-V4-Flash',      // 高性价比
      'deepseek-ai/DeepSeek-V4-Pro',        // 旗舰推理
      'deepseek-ai/DeepSeek-V3.2',
      'Qwen/Qwen2.5-7B-Instruct',           // 免费
      'Qwen/Qwen3-8B',                      // 免费
      'Qwen/Qwen3-235B-A22B-Instruct',
      'zai-org/GLM-5.2',                    // 旗舰
      'zai-org/GLM-4.5-Air',                // 免费快速
      'THUDM/glm-4-9b-chat',                // 免费
      'moonshotai/Kimi-K2.6',
      'Pro/MiniMaxAI/MiniMax-M2.5',
    ],
  },
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    env: 'DEEPSEEK_API_KEY',
    models: [
      'deepseek-v4-flash',        // 快速经济（deepseek-chat 已退役，现指向此）
      'deepseek-v4-pro',          // 旗舰 1M 上下文
      'deepseek-v4-flash-vision-exp', // 视觉实验版
    ],
  },
};

// 根据 baseURL 反推供应商（用于编辑已有模型时预选）
function providerOptions(baseURL) {
  const url = baseURL || '';
  const cur = url.includes('siliconflow') ? 'siliconflow' : url.includes('deepseek') ? 'deepseek' : 'custom';
  const opts = [{ v: 'custom', n: '自定义' }, ...Object.entries(PROVIDERS).map(([k, p]) => ({ v: k, n: p.name }))];
  return opts.map(o => `<option value="${o.v}" ${o.v === cur ? 'selected' : ''}>${o.n}</option>`).join('');
}

// 供应商切换：自动填 URL + 模型 ID 候选（模型名留空时给默认值）
function onProviderChange() {
  const el = $('#m-provider');
  if (!el) return;
  const prov = PROVIDERS[el.value];
  const urlEl = $('#m-url');
  const modelEl = $('#m-model');
  const dl = $('#model-suggestions');
  if (dl) dl.innerHTML = prov ? prov.models.map(md => `<option value="${esc(md)}"></option>`).join('') : '';
  if (prov) {
    if (!urlEl.value || urlEl.value === urlEl.placeholder) urlEl.value = prov.baseURL;
    if (!modelEl.value) modelEl.value = prov.models[0];
  }
}

// ================= 模型详情 =================
function renderModelDetail(id) {
  const m = (state.models || []).find(x => x.id === id);
  if (!m) {
    main.innerHTML = `<div class="card"><div class="empty-hint">选择一个模型，或点击左侧 ＋ 添加。</div></div>`;
    return;
  }
  main.innerHTML = `
    <div class="page-head">
      <h2>${esc(m.name || m.id)}</h2>
      <span class="spacer"></span>
      <button class="ghost sm" onclick="delModel('${m.id}')">删除</button>
      <button class="primary" onclick="saveModel('${m.id}')">保存</button>
    </div>
    <div class="card">
      <div class="card-title">模型配置（OpenAI 兼容）</div>
      <div class="grid-3">
        <div class="field"><label>名称</label><input id="m-name" type="text" value="${esc(m.name || '')}"></div>
        <div class="field"><label>供应商平台</label><select id="m-provider" onchange="onProviderChange()">
          ${providerOptions(m.baseURL)}
        </select></div>
        <div class="field"><label>模型 ID（可下拉选择或自定义）</label><input id="m-model" type="text" list="model-suggestions" value="${esc(m.model || '')}"></div>
      </div>
      <datalist id="model-suggestions"></datalist>
      <div class="frm-row" style="margin-top:12px">
        <label class="frm">Base URL（自动填入，可修改）</label>
        <input id="m-url" type="text" value="${esc(m.baseURL || '')}" placeholder="https://api.siliconflow.cn/v1">
      </div>
      <div class="grid-2" style="margin-top:12px">
        <div class="field"><label>API Key（直接填写）</label><input id="m-key" type="password" value="${esc(m.apiKey || '')}" placeholder="sk-..."></div>
        <div class="field"><label>或 .env 变量名（二选一）</label><input id="m-env" type="text" value="${esc(m.apiKeyEnv || '')}" placeholder="SILICONFLOW_API_KEY"></div>
      </div>
      <div class="grid-3" style="margin-top:12px">
        <div class="field"><label>温度</label><input id="m-temp" type="number" step="0.1" value="${m.temperature ?? 0.7}"></div>
        <div class="field"><label>最大 tokens（留空 = 不限制）</label><input id="m-tokens" type="number" value="${m.maxTokens > 0 ? m.maxTokens : ''}" placeholder="不限制"></div>
        <div class="field"><label>Key 状态</label><div class="value">${m.hasKey ? '✅ 已配置' : '❌ 未配置'}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">连通性测试</div>
      <button onclick="testModel('${m.id}')">发送测试请求</button>
      <div id="test-result" class="empty-hint" style="margin-top:10px"></div>
    </div>`;
  onProviderChange(); // 填充模型 ID 候选
}

async function saveModel(id) {
  const models = (state.models || []).slice();
  const i = models.findIndex(x => x.id === id);
  if (i < 0) return;
  models[i] = {
    ...models[i],
    name: $('#m-name').value.trim(),
    model: $('#m-model').value.trim(),
    baseURL: $('#m-url').value.trim(),
    apiKey: $('#m-key').value.trim(),
    apiKeyEnv: $('#m-env').value.trim(),
    temperature: Number($('#m-temp').value) || 0.7,
    maxTokens: Number($('#m-tokens').value) || 0,
  };
  const r = await api('/api/config', 'PUT', { models });
  r.ok ? toast('已保存', 'ok') : toast(r.err, 'err');
  if (r.ok) await loadState();
}

async function delModel(id) {
  if (!confirm(`确定删除模型「${id}」？`)) return;
  const models = (state.models || []).filter(x => x.id !== id);
  const r = await api('/api/config', 'PUT', { models });
  r.ok ? toast('已删除', 'ok') : toast(r.err, 'err');
  if (r.ok) await loadState();
}

async function testModel(id) {
  const el = $('#test-result');
  if (!el) return;
  el.textContent = '测试中…';
  const r = await api(`/api/models/${id}/test`, 'POST');
  el.textContent = r.ok ? '✅ ' + (r.reply || '').slice(0, 120) : '❌ ' + (r.err || '失败');
}

// ================= 模型表单（添加） =================
function renderModelForm() {
  main.innerHTML = `
    <div class="page-head">
      <h2>添加模型</h2>
      <span class="spacer"></span>
      <button class="ghost sm" onclick="backToModels()">← 返回</button>
    </div>
    <div class="card">
      <div class="grid-2">
        <div class="field"><label>ID</label><input id="m-id" type="text" placeholder="my-model"></div>
        <div class="field"><label>名称</label><input id="m-name" type="text" placeholder="我的模型"></div>
      </div>
      <div class="grid-2" style="margin-top:12px">
        <div class="field"><label>供应商平台</label><select id="m-provider" onchange="onProviderChange()">
          <option value="custom">自定义</option>
          <option value="siliconflow" selected>硅基流动</option>
          <option value="deepseek">DeepSeek</option>
        </select></div>
        <div class="field"><label>模型 ID（可下拉选择或自定义）</label><input id="m-model" type="text" list="model-suggestions" placeholder="Qwen/Qwen2.5-7B-Instruct"></div>
      </div>
      <datalist id="model-suggestions"></datalist>
      <div class="frm-row" style="margin-top:12px">
        <label class="frm">Base URL（自动填入，可修改）</label>
        <input id="m-url" type="text" placeholder="https://api.siliconflow.cn/v1">
      </div>
      <div class="grid-2" style="margin-top:12px">
        <div class="field"><label>API Key（直接填写）</label><input id="m-key" type="password" placeholder="sk-..."></div>
        <div class="field"><label>或 .env 变量名（二选一）</label><input id="m-env" type="text" placeholder="SILICONFLOW_API_KEY"></div>
      </div>
      <div class="grid-3" style="margin-top:12px">
        <div class="field"><label>温度</label><input id="m-temp" type="number" step="0.1" value="0.7"></div>
        <div class="field"><label>最大 tokens（留空 = 不限制）</label><input id="m-tokens" type="number" placeholder="不限制"></div>
      </div>
      <p class="empty-hint" style="margin-top:10px">直接填 Key 最省事；或用 .env 变量名引用（如 SILICONFLOW_API_KEY），二选一即可。</p>
      <div style="margin-top:18px;display:flex;gap:8px">
        <button class="primary" onclick="createModel()">创建</button>
        <button class="ghost" onclick="backToModels()">取消</button>
      </div>
    </div>`;
  onProviderChange(); // 默认填入硅基流动配置
}

function backToModels() { view = { type: 'model', id: (state.models || [])[0]?.id || null }; renderSidebar(); renderMain(); }

async function createModel() {
  const entry = {
    id: $('#m-id').value.trim(),
    name: $('#m-name').value.trim() || $('#m-id').value.trim(),
    baseURL: $('#m-url').value.trim(),
    model: $('#m-model').value.trim(),
    apiKey: $('#m-key').value.trim(),
    apiKeyEnv: $('#m-env').value.trim(),
    temperature: Number($('#m-temp').value) || 0.7,
    maxTokens: Number($('#m-tokens').value) || 0,
  };
  if (!entry.id) return toast('请填写模型 ID', 'err');
  if ((state.models || []).some(m => m.id === entry.id)) return toast('该 ID 已存在', 'err');
  const models = (state.models || []).concat(entry);
  const r = await api('/api/config', 'PUT', { models });
  r.ok ? toast('已创建', 'ok') : toast(r.err, 'err');
  if (r.ok) { view = { type: 'model', id: entry.id }; await loadState(); }
}

// ---------- 主题切换（亮/暗，localStorage 持久化） ----------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('qqbot-theme', theme);
  $('#btn-theme').textContent = theme === 'light' ? '☀' : '☾';
  $('#btn-theme').title = theme === 'light' ? '切换暗色主题' : '切换亮色主题';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

// ---------- 事件绑定 ----------
$('#btn-add-bot').addEventListener('click', () => { view = { type: 'bot-form' }; renderMain(); });
$('#btn-add-model').addEventListener('click', () => { view = { type: 'model-form' }; renderMain(); });
$('#btn-refresh').addEventListener('click', loadState);
$('#btn-theme').addEventListener('click', toggleTheme);

// 启动：恢复主题 + 加载状态
applyTheme(localStorage.getItem('qqbot-theme') || 'dark');
loadState();
