// 模型路由层：DeepSeek 官方 / 任意 OpenAI 兼容端点
// 全部走 fetch（Node 18+ 内置）
'use strict';

// 粗略估算消息的 prompt token 数（仅在模型未返回 usage 时兜底，如请求失败）
// 规则：ASCII 约 4 字符/token，中文约 1 字/token，其余按 2 字符/token
function estimateTokens(messages) {
  let n = 0;
  const walk = (s) => {
    for (const ch of String(s ?? '')) {
      const c = ch.codePointAt(0);
      if (c < 128) n += 0.25;
      else if (c >= 0x4e00 && c <= 0x9fff) n += 1;
      else n += 0.5;
    }
  };
  for (const m of messages || []) { walk(m.role); walk(': '); walk(m.content); walk('\n'); }
  return Math.max(1, Math.ceil(n));
}

// 调用 chat/completions（OpenAI 兼容协议）
// 返回 { content, usage, promptTokens }：usage 为模型返回的精确用量（可能为 null），
// promptTokens 为本地估算值（请求失败等拿不到 usage 时兜底）
async function chat(model, messages, options = {}) {
  const apiKey = options.apiKey || null;
  if (!apiKey) throw new Error('缺少 API Key');

  const promptTokens = estimateTokens(messages);

  const url = (model.baseURL || '').replace(/\/+$/, '') + '/chat/completions';
  const body = {
    model: model.model,
    messages,
    temperature: options.temperature ?? model.temperature ?? 0.7,
  };
  // maxTokens 为 0 / 空 = 不限制（不传 max_tokens，交给模型默认）
  const maxTokens = options.maxTokens ?? model.maxTokens;
  if (maxTokens && maxTokens > 0) body.max_tokens = maxTokens;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    // 网络层错误（连接失败/超时等）同样消耗 token，挂上估算值供统计兜底
    fetchErr.promptTokens = promptTokens;
    throw fetchErr;
  }

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: { message: text.slice(0, 300) } }; }

  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const err = new Error('模型调用失败: ' + msg);
    err.promptTokens = promptTokens; // 失败时也把估算值带出，便于统计兜底
    throw err;
  }
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    usage: data.usage || null,
    promptTokens,
  };
}

module.exports = { chat };