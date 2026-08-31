// 模型路由层：DeepSeek 官方 / 任意 OpenAI 兼容端点
// 全部走 fetch（Node 18+ 内置）
'use strict';

// 调用 chat/completions（OpenAI 兼容协议）
async function chat(model, messages, options = {}) {
  const apiKey = options.apiKey || null;
  if (!apiKey) throw new Error('缺少 API Key');

  const url = (model.baseURL || '').replace(/\/+$/, '') + '/chat/completions';
  const body = {
    model: model.model,
    messages,
    temperature: options.temperature ?? model.temperature ?? 0.7,
  };
  // maxTokens 为 0 / 空 = 不限制（不传 max_tokens，交给模型默认）
  const maxTokens = options.maxTokens ?? model.maxTokens;
  if (maxTokens && maxTokens > 0) body.max_tokens = maxTokens;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: { message: text.slice(0, 300) } }; }

  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error('模型调用失败: ' + msg);
  }
  return data.choices?.[0]?.message?.content ?? '';
}

module.exports = { chat };