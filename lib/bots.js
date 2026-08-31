// 多机器人管理器：基于 QQ v2 协议（AppID + AppSecret），连接/分发/重启
'use strict';
const qqv2 = require('./qqv2');

class BotManager {
  constructor(ctx) {
    this.ctx = ctx; // { getConfig, env, resolveSecret, handleMessage }
    this.items = new Map(); // botId -> { stop, status, username }
  }

  sync(config) {
    // 停止已移除的机器人
    for (const id of [...this.items.keys()]) {
      if (!config.bots.some((b) => b.id === id)) this.stop(id);
    }
    // 启动/重启配置中的机器人
    for (const bot of config.bots) {
      if (!bot.enabled) { this.stop(bot.id); continue; }
      this.start(bot);
    }
  }

  start(bot) {
    const appId = this.ctx.resolveSecret(bot.appId, this.ctx.env);
    const appSecret = this.ctx.resolveSecret(bot.appSecret, this.ctx.env);
    if (!appId || !appSecret) {
      console.warn(`[bot:${bot.id}] 未配置 AppID/AppSecret，跳过`);
      this.setStatus(bot.id, '未配置');
      return;
    }

    const key = JSON.stringify({ appId, appSecret, intents: bot.intents, sandbox: bot.sandbox });
    const cur = this.items.get(bot.id);
    if (cur && cur._key === key && cur.status === '已连接') return; // 配置未变则保持连接

    this.stop(bot.id);

    const intents = bot.intents || ['GROUP_AND_C2C_EVENT', 'PUBLIC_GUILD_MESSAGES'];
    const handle = qqv2.startBot({
      appId,
      appSecret,
      sandbox: bot.sandbox !== false,
      intents,
      handlers: {
        onReady: (d) => {
          this.setStatus(bot.id, '已连接', d?.user?.username || '');
          console.log(`[bot:${bot.id}] ✅ 已连接（${bot.name || bot.id}）`);
        },
        onEvent: async (type, d) => {
          const evt = qqv2.normalizeEvent(type, d);
          if (!evt) return;
          await this.ctx.handleMessage(bot.id, evt);
        },
        onError: (err) => {
          this.setStatus(bot.id, '错误');
        },
        onClose: () => {
          this.setStatus(bot.id, '已断开');
        },
      },
    });

    this.items.set(bot.id, { stop: handle.stop, _key: key, status: '连接中' });
    console.log(`[bot:${bot.id}] 启动中（AppID: ${appId}，沙箱: ${bot.sandbox !== false}）`);
  }

  send(bot, scene, targetId, content, msgId) {
    const appId = this.ctx.resolveSecret(bot.appId, this.ctx.env);
    const appSecret = this.ctx.resolveSecret(bot.appSecret, this.ctx.env);
    return qqv2.sendReply(appId, appSecret, bot.sandbox !== false, scene, targetId, content, msgId);
  }

  setStatus(id, status, username) {
    const item = this.items.get(id);
    if (item) {
      item.status = status;
      if (username) item.username = username;
    }
  }

  isRunning(id) {
    return this.items.get(id)?.status === '已连接';
  }

  getStatus(id) {
    const item = this.items.get(id);
    return item ? { status: item.status, username: item.username } : { status: '未启动' };
  }

  stop(id) {
    const item = this.items.get(id);
    if (item) {
      try { item.stop(); } catch {}
      this.items.delete(id);
    }
  }

  stopAll() {
    for (const id of [...this.items.keys()]) this.stop(id);
  }
}

module.exports = BotManager;