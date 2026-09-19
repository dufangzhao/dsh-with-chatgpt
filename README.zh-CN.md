# DSH with ChatGPT

让 ChatGPT 负责规划与审查，让 DeepSeek Harness（DSH）负责本地执行。

本项目基于
[`XiaoDuoYa/codex-with-chatgpt`](https://github.com/XiaoDuoYa/codex-with-chatgpt)
改造，保留原方案的只读 MCP、OAuth PKCE 配对、Cloudflare 隧道、执行记录和
任务状态机；把执行器从 Codex 替换成 DSH 原生 Cordis 插件。

## 工作原理

```text
ChatGPT 网页（规划 / 审查）
       │
       │ HTTPS + OAuth + 只读 MCP
       ▼
Cloudflare 隧道 → 本地 D2C Bridge → 当前项目代码（只读）
                                  → 脱敏后的执行记录

DSH（唯一执行器）→ 修改文件 / 运行命令 / 测试 / Git
       ├─ dsh_chatgpt：受约束的桥接管理工具
       └─ BrowserSkill：操作 ChatGPT 网页
```

并不是把项目部署到 Cloudflare。Cloudflare 只转发到本机 Bridge；源代码仍在
本机。ChatGPT 只能调用 Bridge 暴露的只读工具，不能直接写文件或运行 Shell。

## 已验证环境

- DSH `0.1.5-rc.2`
- Node.js `22.19.x` 或 `24.x`
- `@wxg-prc-cpg/browser-skill-dsh-plugin` `0.1.2`
- cloudflared `2026.9.1`

DSH 目前仍是预发布接口。升级到 `compatibility.json` 范围之外时，应重新做
插件加载、Web Profile 启动和真实工具调用验证。

## 安装

```powershell
pnpm install
pnpm build
dsh plugin --profile web add file:C:/你的绝对路径/dsh-with-chatgpt
```

验证：

```powershell
dsh plugin --profile web list
dsh --profile web --dump-config
dsh --profile web --no-open --port 0
```

然后在 DSH 中说：

```text
使用 DSH with ChatGPT，把 ChatGPT 作为规划和审查端连接到当前项目。
```

插件会加载内置 Skill，引导 DSH：

1. 检查 Bridge 与 Cloudflare 连接；
2. 通过 BrowserSkill 在 ChatGPT 中创建 OAuth 连接器；
3. 用一次性配对码授权；
4. 按 `INIT → PLAN → EXECUTING → EXECUTED → REVIEW` 循环协作；
5. DSH 始终保留修改、测试和交付权限。

## 两个模型可以不同

可以。ChatGPT 网页端使用你在 ChatGPT 中选定的模型；DSH 执行端使用 DSH
当前配置的 DeepSeek 或其他兼容模型。两边通过文字协议和 MCP 上下文协作，
不要求模型相同。

## 安全边界

- ChatGPT 侧只有只读 MCP 工具；
- 配对码短时有效，授权使用 OAuth PKCE；
- Token 与运行状态保存在本机，不写入项目仓库；
- 插件不会读取或保存浏览器 Cookie、ChatGPT 密码或 GitHub 凭据；
- `dsh_chatgpt` 只接受固定动作，不接受任意 Shell；
- 当前工作区由 DSH 会话目录决定，模型不能通过该工具任意换目录。

停止服务用 `d2c stop`；立即撤销 ChatGPT 访问权限用 `d2c unpair`。

## 许可证

MIT。上游归属和改造说明见 `NOTICE.md`。
