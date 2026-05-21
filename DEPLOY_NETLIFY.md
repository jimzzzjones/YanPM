# YanPM 免费测试部署：Netlify

YanPM 可以部署到 Netlify。当前项目已经补齐 Netlify 配置：

- `netlify.toml`：构建、发布目录、函数目录和 API 转发规则
- `netlify/functions/api.mjs`：AI 代理、项目状态保存、微信/企业微信登录接口
- `scripts/build-netlify.mjs`：把前端文件构建到 `dist`

## 部署步骤

1. 把当前项目上传到 GitHub。
2. 打开 Netlify：`https://app.netlify.com/`
3. 选择 `Add new project`。
4. 选择 `Import an existing project`。
5. 连接 GitHub 仓库。
6. Netlify 会自动读取 `netlify.toml`：

```text
Build command: npm run netlify:build
Publish directory: dist
Functions directory: netlify/functions
```

7. 点击 Deploy。
8. 部署完成后打开 Netlify 分配的 HTTPS 地址。

## 必填环境变量

进入 Netlify 项目设置：

```text
Project configuration -> Environment variables
```

先设置：

```text
YANPM_PUBLIC_URL=https://你的项目名.netlify.app
AUTH_DEV_MODE=1
YANPM_ENABLE_CODEX_TEST=0
AUTH_STATE_SECRET=一段随机长字符串
```

Netlify Functions 的密钥必须在 Netlify UI、CLI 或 API 中设置，不能只写在 `netlify.toml` 里。

## AI 测试

如果只测试产品流程，可以不填 AI Key，使用本地模拟。

如果要测试真实模型，在 Netlify 环境变量中加入：

```text
AI_API_KEY=你的模型 API Key
```

然后在应用的 AI 设置里选择对应供应商和模型。Netlify 环境不支持 Codex 临时测试通道，线上测试请使用真实模型 API 或本地模拟。

## 微信与企业微信回调

微信开放平台网站应用回调：

```text
https://你的项目名.netlify.app/api/auth/wechat/callback
```

企业微信回调：

```text
https://你的项目名.netlify.app/api/auth/wecom/callback
```

需要配置的环境变量：

```text
WECHAT_WEB_APP_ID=
WECHAT_WEB_APP_SECRET=
WECOM_CORP_ID=
WECOM_AGENT_ID=
WECOM_APP_SECRET=
WECOM_LOGIN_MODE=qr
WECOM_OAUTH_SCOPE=snsapi_privateinfo
```

联调阶段可以保留 `AUTH_DEV_MODE=1`，方便使用本地实名模式完成审计测试。正式公开测试时建议改为 `AUTH_DEV_MODE=0`。

## 数据保存

Netlify 版本使用 Netlify Blobs 保存项目状态，适合测试和轻量试用。它不是正式的项目数据库，后续团队版仍建议迁移到数据库，用于权限、组织、审计日志和多用户并发。

## 本地检查

部署前可运行：

```bash
npm run netlify:build
```

构建成功后会生成 `dist` 目录。这个目录不需要手动上传，Netlify 会在云端自动构建。
