# QQBOT 控制台 — QQ 机器人管理面板

> **[English](README.en.md) · 中文**

本地运行的可视化管理工具：**多个 QQ 机器人 + 角色人设/记忆文档 + 任意 OpenAI 兼容模型**，并内置「面板管理员 AI」、「心跳任务」、「精彩时刻」等自动化能力。

```
QQ 用户发消息 → 机器人连接层（qq-guild-bot，WebSocket）
   → 组装人设(memory/<id>/*.md) + 最近会话
   → 调用绑定模型（DeepSeek / 硅基流动 / 智谱 / Ollama…）
   → 自动回复并写入会话记录
   → Web 面板(http://127.0.0.1:4357)统一查看与运维
```

## 功能一览

| 模块 | 说明 |
|------|------|
| 多机器人 | 添加/编辑/删除多个 QQ 机器人，独立 AppID/Secret，实时连接状态（绿=已连 / 黄=对话中 / 红=掉线） |
| 记忆库 | 每个机器人多份 Markdown 记忆文件（人设/剧情/内容…），支持开关、AI 自动归档、全文搜索、分支回切 |
| 模型接入 | DeepSeek / 任意 OpenAI 兼容端点，一键绑定、测试连通、Token 用量统计 |
| 联网搜索 | function calling 联网：轻量抓标题摘要 ⇄ 无头浏览器抓正文，按需自动分级（可逐机器人覆盖） |
| 面板管理员 AI | 内置 Agent：只读评估 → 生成「待确认」修改建议，你在弹窗点确认才落盘；对话历史跨会话保留 |
| 心跳任务 | 机器人主动发言：每张任务卡一个调度，支持 定时/间隔/随机 三种模式，每机器人最多 3 个任务 |
| 精彩时刻 | AI 从记忆档案 + 最近对话中提炼该角色的高光片段，展示在机器人卡片上 |
| 外观 | 主题色 / 明暗切换 / 卡片背景动效（像素海浪、流光、黑客雨、流星） |

## 🚀 快速部署（GitHub 下载后 3 步上手）

**Windows**：双击根目录 **`安装并启动.bat`** —— 自动 `npm install` → 用示例生成缺失的 `config.json` / `.env`（**不会覆盖已存在文件**）→ 启动面板并打开浏览器。

**macOS / Linux**：

```bash
npm install
npm run setup     # 一键初始化：检查依赖 + 自动生成缺失的示例配置
npm start
```

然后二选一完成凭据：
1. 编辑 `config.json`（机器人 AppID、绑定模型）与 `.env`（QQ Secret、模型 Key）；或
2. 直接打开 **http://127.0.0.1:4357**，在面板「机器人 / 模型」页里可视化添加（保存即落盘）。

> 需要联网搜索/浏览器能力时，Playwright 首次使用会自动准备浏览器内核；长期运行可用 `pm2 start server.js --name qqbot-panel` 守护。

## 目录结构

```
server.js            入口：HTTP 面板 + API + QQ 机器人调度
setup.js             一键初始化（自动生成缺失的示例配置）
安装并启动.bat        Windows 一键：装依赖 → 初始化 → 启动
lib/
  bots.js            QQ 机器人接入与生命周期
  memory.js          记忆库 / 会话 / 全局设定
  models.js          OpenAI 兼容模型调用（含联网工具）
  qqv2.js            QQ v2 网关
  search.js          联网搜索（轻量 + 浏览器）
  store.js           config 读写
public/              面板前端（原生 HTML/CSS/JS，无构建）
memory/              运行期数据：角色记忆与对话（勿提交）
avatars/             上传的头像图片（勿提交）
```

## 快速开始

1. **安装依赖**

   ```bash
   npm install
   ```

2. **准备配置**（复制示例为真实配置，填入凭据）

   ```bash
   cp config.example.json config.json     # Windows: copy config.example.json config.json
   cp .env.example .env                   # Windows: copy .env.example .env
   ```

   - `.env` 放密钥：QQ Secret、各模型 API Key
   - `config.json` 填机器人（AppID、绑定模型、`apiKeyEnv` 指向 .env 变量）
   - 也可直接在面板「机器人 / 模型」页里添加和编辑，保存自动落盘

3. **启动**

   ```bash
   npm start
   ```

   或 Windows 下双击 `start.cmd` / `启动面板.bat`（自动打开浏览器）。
   面板地址 **http://127.0.0.1:4357**。

4. **把机器人拉进频道 / 私信它**，即可开始对话；在面板里完善人设记忆，回复会按人设来。

## 配置与安全（重要）

| 文件 | 用途 | 是否提交仓库 |
|------|------|------|
| `config.json` | 端口、机器人、模型 | **否**（含凭据，已 gitignore） |
| `.env` | QQ Secret、模型 API Key | **否**（已 gitignore） |
| `memory/` | 角色记忆、对话记录 | **否**（已 gitignore） |
| `avatars/` | 上传的头像 | 否 |
| `config.example.json` / `.env.example` | 公开占位模板 | 是 |

- 服务默认只监听 `127.0.0.1`，面板仅供本机使用。
- 密钥支持两种写法：直接填在 `config.json`，或用 `env:变量名` 引用 `.env`（推荐，避免面板文件内明文）。
- 发布/共享本仓库前，请确认上述运行期文件未被加入版本库；`.gitignore` 已默认排除。

## 使用提示

- **机器人连接不上**：确认 `.env` 的 Secret、面板卡片上 AppID 无误，查看终端日志。
- **不回复 / 报错**：先确认该机器人已绑定模型，且对应 `apiKeyEnv` 的 Key 有效（面板「模型」页可一键测试）。
- **清空/重置某机器人**：会话记录卡右上「清空」；记忆文件可单独禁用/删除。
- **让机器人主动说话**：机器人详情页底部「心跳任务」，每张卡配置一种调度。
- **让管理员提炼亮点**：机器人卡片点「✨ 总结精彩时刻」，或对面板管理员说"总结 BOT1 的精彩时刻"。
