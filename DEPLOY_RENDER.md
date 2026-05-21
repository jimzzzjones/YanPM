# YanPM 免费测试部署：Render

Render 的免费 Web Service 可以直接运行当前的 Node 后端，适合给团队做外部测试链接。当前仓库已经包含 `render.yaml`，在 Render 里选择 Blueprint 或 Web Service 后即可识别。

## 适用范围

- 适合：产品演示、内部试用、微信/企业微信登录回调联调、AI API 联调。
- 不适合：正式生产、长期保存项目数据、大量团队并发使用。

免费实例空闲后会休眠，下一次访问可能需要等待约一分钟。本地文件系统不是持久存储，服务重启、重新部署或休眠后，`data/state.json` 中的测试数据可能丢失。正式版本应接入数据库保存项目、用户和审计日志。

## 部署步骤

1. 把当前项目上传到 GitHub 仓库。
2. 打开 Render Dashboard，选择 `New`。
3. 推荐选择 `Blueprint`，连接刚刚的 GitHub 仓库。
4. Render 会读取仓库根目录的 `render.yaml`，创建 `yanpm-web` 服务。
5. 实例类型选择 `Free`。
6. 首次创建时填写需要的环境变量：

```text
YANPM_PUBLIC_URL=https://你的服务名.onrender.com
AUTH_DEV_MODE=1
YANPM_ENABLE_CODEX_TEST=0
AI_API_KEY=你的模型 API Key，可先留空
WECHAT_WEB_APP_ID=微信开放平台 AppID，可先留空
WECHAT_WEB_APP_SECRET=微信开放平台 Secret，可先留空
WECOM_CORP_ID=企业微信 CorpID，可先留空
WECOM_AGENT_ID=企业微信 AgentID，可先留空
WECOM_APP_SECRET=企业微信 Secret，可先留空
```

7. 点击 Deploy。
8. 部署完成后打开 Render 分配的 HTTPS 地址。

## AI 测试

如果只想先测试产品流程，可以不填 `AI_API_KEY`，应用会使用本地模拟结果。

如果要测试真实 AI 输出，在 Render 环境变量中填写 `AI_API_KEY`，然后在应用的 AI 设置里选择对应供应商和模型。第一版测试建议优先使用后端代理，不把 API Key 发给浏览器。

## 微信与企业微信回调

部署完成后，把 Render 的 HTTPS 地址填入平台后台。

微信开放平台网站应用回调：

```text
https://你的服务名.onrender.com/api/auth/wechat/callback
```

企业微信回调：

```text
https://你的服务名.onrender.com/api/auth/wecom/callback
```

联调阶段可以保留 `AUTH_DEV_MODE=1`，这样即使微信或企业微信凭据暂时没有配置，也可以用本地实名模式完成审计测试。正式公开测试时建议改为 `AUTH_DEV_MODE=0`，强制使用真实授权登录。

## 发布前检查

本地或云端构建前会运行：

```bash
npm run release:check
```

这个检查会验证前端和后端脚本语法。部署失败时，先查看 Render 的 Build Logs 和 Runtime Logs。

## 当前限制

- 免费实例会休眠，首次打开可能较慢。
- 免费 Web Service 没有持久磁盘，测试数据不保证长期保留。
- 当前审计日志仍保存在应用状态里，正式团队版应迁移到数据库。
- 微信和企业微信正式可用需要配置真实平台应用、HTTPS 回调域名和相应审核。
