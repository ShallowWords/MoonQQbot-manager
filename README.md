# QQ 机器人管理面板

本地运行的可视化管理工具：**多个 QQ 机器人 + 人设/记忆文档 + 任意 OpenAI 兼容模型**（含 DeepSeek）。

```
QQ 用户在频道/私信发消息 → 机器人连接层（qq-guild-bot 官方 SDK，WebSocket）
   → 带上人设(memory/<id>/persona.md) + 最近会话(sessions.jsonl)
   → 调用绑定的模型（DeepSeek / 任意 OpenAI 兼容端点）
   → 自动回复并写入会话记忆
   → 同时通过 Web 面板(http://127.0.0.1:4357)统一管理
```

## 三个能力

| 模块 | 说明 |
|------|------|
| 机器人 | 添加/编辑/删除多个 QQ 机器人，每个独立 AppID/Token，面板实时显示连接状态 |
| 记忆文档 | 每个机器人一份 Markdown 人设（作为 AI 系统提示）+ 会话历史记录，面板内直接编辑 |
| 模型接入 | DeepSeek 或任意 OpenAI 兼容端点（智谱、硅基流动、本地 Ollama 等），一键绑定到机器人、一键测试 |

## 快速开始

1. **安装依赖**
   ```bash
   npm install
   ```

2. **配置凭据**：把 `.env.example` 复制为 `.env`，填入
   - `QQBOT_APPID` / `QQBOT_TOKEN`：QQ 开放平台的机器人 AppID 与 Token
   - `DEEPSEEK_API_KEY`（或你用的模型 Key）

3. **启动**
   ```bash
   npm start
   # 或双击 start.cmd
   ```
   浏览器打开 **http://127.0.0.1:4357** 即可进入面板。

4. **添加机器人**：面板「机器人」页 → 添加 → 填 AppID/Token、绑定模型 → 保存后自动连接。
   然后把机器人拉进你的频道/私信它，就能对话了。

5. **完善人设**：面板「记忆文档」页 → 选中机器人 → 编辑 Markdown 人设（名字、性格、说话风格）→ 保存。AI 回复会按照人设来。

## 配置文件

| 文件 | 说明 |
|------|------|
| `config.json` | 面板端口、机器人列表、模型列表（**不存密钥**） |
| `.env` | 所有密钥（AppID/Token、模型 API Key），用 `apiKeyEnv` 引用 |
| `memory/<机器人ID>/persona.md` | 人设记忆（Markdown） |
| `memory/<机器人ID>/sessions.jsonl` | 会话记录 |

## 添加新模型

面板「模型接入」页 → 添加 → 填 Base URL / 模型名 / `.env` 变量名 → 保存 → 测试连通。
模型名要和你用的服务一致，例如 DeepSeek 填 `deepseek-chat`、本地 Ollama 填 `qwen2.5:7b`、智谱填 `glm-4`。

## 故障排查

- **面板打不开**：确认 `npm start` 成功、端口 4357 未被占用
- **机器人不连接**：检查 `.env` 的 AppID/Token 是否填写正确，面板机器人卡片看状态
- **机器人不回复**：检查该机器人是否绑定了模型、`.env` 是否正确配置对应 API Key，用面板「模型接入 → 测试」验证
- **回复报错**：看终端日志（机器人消息、回复错误都会打印）