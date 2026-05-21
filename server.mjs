import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const dataDir = path.join(root, "data");
const stateFile = path.join(dataDir, "state.json");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const configuredAiTimeoutMs = Number(process.env.AI_TIMEOUT_MS || 25000);
const aiTimeoutMs = Number.isFinite(configuredAiTimeoutMs) ? Math.min(Math.max(configuredAiTimeoutMs, 5000), 25000) : 25000;
const codexTimeoutMs = Number(process.env.CODEX_TIMEOUT_MS || 60000);
const codexCommand = resolveCodexCommand();
const publicUrl = (process.env.YANPM_PUBLIC_URL || `http://127.0.0.1:${port}`).replace(/\/+$/, "");
const authDevMode = process.env.AUTH_DEV_MODE !== "0";
const oauthStates = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(text);
}

function sendHtml(res, status, html) {
  sendText(res, status, html, "text/html; charset=utf-8");
}

function resolveCodexCommand() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  const candidates = [
    path.join(path.dirname(process.execPath), "codex"),
    ...(process.env.PATH || "")
      .split(path.delimiter)
      .filter(Boolean)
      .map((item) => path.join(item, "codex"))
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "codex";
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) throw new Error("请求体过大");
  }
  return raw ? JSON.parse(raw) : {};
}

async function handleState(req, res) {
  if (req.method === "GET") {
    if (!existsSync(stateFile)) return sendJson(res, 200, { state: null });
    const state = JSON.parse(await readFile(stateFile, "utf8"));
    return sendJson(res, 200, { state });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    await mkdir(dataDir, { recursive: true });
    await writeFile(stateFile, JSON.stringify(body.state || body, null, 2));
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: "Method not allowed" });
}

async function handleAuth(req, res, url) {
  if (url.pathname === "/api/auth/config") {
    return sendJson(res, 200, buildAuthConfig());
  }

  if (url.pathname === "/api/auth/dev") {
    if (!authDevMode) return sendJson(res, 403, { error: "开发登录已关闭。" });
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    const body = await readBody(req);
    return sendJson(res, 200, {
      user: normalizeAuthUser({
        provider: body.provider || "dev",
        providerLabel: body.providerLabel || "开发模式",
        id: `dev:${slugId(body.realName || body.name || "user")}`,
        nickname: body.name || body.realName || "开发用户",
        realName: body.realName || body.name || "开发用户",
        org: body.org || "本地体验组织",
        email: body.email || "",
        mobile: body.mobile || "",
        verificationStatus: "self_attested",
        verified: Boolean(body.realName || body.mobile || body.email)
      })
    });
  }

  if (url.pathname === "/api/auth/wechat/start") {
    const config = buildAuthConfig().wechat;
    if (!config.enabled) return sendHtml(res, 200, authUnavailableHtml("微信开放平台", config.reason));
    return redirect(res, buildWechatAuthorizeUrl());
  }

  if (url.pathname === "/api/auth/wecom/start") {
    const config = buildAuthConfig().wecom;
    if (!config.enabled) return sendHtml(res, 200, authUnavailableHtml("企业微信", config.reason));
    return redirect(res, buildWecomAuthorizeUrl());
  }

  if (url.pathname === "/api/auth/wechat/callback") {
    return sendHtml(res, 200, await finishWechatAuth(url));
  }

  if (url.pathname === "/api/auth/wecom/callback") {
    return sendHtml(res, 200, await finishWecomAuth(url));
  }

  return sendJson(res, 404, { error: "Auth endpoint not found" });
}

function buildAuthConfig() {
  const wechatReady = Boolean(process.env.WECHAT_WEB_APP_ID && process.env.WECHAT_WEB_APP_SECRET);
  const wecomReady = Boolean(process.env.WECOM_CORP_ID && process.env.WECOM_AGENT_ID && process.env.WECOM_APP_SECRET);
  return {
    devMode: authDevMode,
    publicUrl,
    wechat: {
      enabled: wechatReady,
      startUrl: "/api/auth/wechat/start",
      reason: wechatReady ? "" : "缺少 WECHAT_WEB_APP_ID / WECHAT_WEB_APP_SECRET"
    },
    wecom: {
      enabled: wecomReady,
      startUrl: "/api/auth/wecom/start",
      reason: wecomReady ? "" : "缺少 WECOM_CORP_ID / WECOM_AGENT_ID / WECOM_APP_SECRET"
    }
  };
}

function buildWechatAuthorizeUrl() {
  const state = createOauthState("wechat");
  const redirectUri = process.env.WECHAT_WEB_REDIRECT_URI || `${publicUrl}/api/auth/wechat/callback`;
  return `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(process.env.WECHAT_WEB_APP_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_login&state=${encodeURIComponent(state)}#wechat_redirect`;
}

function buildWecomAuthorizeUrl() {
  const state = createOauthState("wecom");
  const redirectUri = process.env.WECOM_REDIRECT_URI || `${publicUrl}/api/auth/wecom/callback`;
  const corpId = encodeURIComponent(process.env.WECOM_CORP_ID);
  const agentId = encodeURIComponent(process.env.WECOM_AGENT_ID);
  if (process.env.WECOM_LOGIN_MODE === "qr") {
    return `https://login.work.weixin.qq.com/wwlogin/sso/qrConnect?appid=${corpId}&agentid=${agentId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  }
  const scope = encodeURIComponent(process.env.WECOM_OAUTH_SCOPE || "snsapi_privateinfo");
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${corpId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}&agentid=${agentId}#wechat_redirect`;
}

function createOauthState(provider) {
  const value = `${provider}_${randomBytes(16).toString("hex")}`;
  oauthStates.set(value, { provider, createdAt: Date.now() });
  return value;
}

function consumeOauthState(provider, value) {
  const record = oauthStates.get(value);
  oauthStates.delete(value);
  return Boolean(record && record.provider === provider && Date.now() - record.createdAt < 10 * 60 * 1000);
}

async function finishWechatAuth(url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !consumeOauthState("wechat", state)) return authCallbackHtml(null, "微信授权状态失效，请重新登录。");

  const token = await fetchJson(
    `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(process.env.WECHAT_WEB_APP_ID)}&secret=${encodeURIComponent(process.env.WECHAT_WEB_APP_SECRET)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`
  );
  if (token.errcode) return authCallbackHtml(null, token.errmsg || "微信授权失败。");

  const profile = await fetchJson(
    `https://api.weixin.qq.com/sns/userinfo?access_token=${encodeURIComponent(token.access_token)}&openid=${encodeURIComponent(token.openid)}&lang=zh_CN`
  );
  if (profile.errcode) return authCallbackHtml(null, profile.errmsg || "获取微信用户信息失败。");

  return authCallbackHtml(
    normalizeAuthUser({
      provider: "wechat",
      providerLabel: "微信开放平台",
      id: `wechat:${profile.unionid || profile.openid}`,
      nickname: profile.nickname,
      avatar: profile.headimgurl,
      openid: profile.openid,
      unionid: profile.unionid || "",
      verificationStatus: "wechat_bound",
      verified: false
    })
  );
}

async function finishWecomAuth(url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !consumeOauthState("wecom", state)) return authCallbackHtml(null, "企业微信授权状态失效，请重新登录。");

  const token = await fetchJson(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(process.env.WECOM_CORP_ID)}&corpsecret=${encodeURIComponent(process.env.WECOM_APP_SECRET)}`
  );
  if (token.errcode) return authCallbackHtml(null, token.errmsg || "企业微信 access_token 获取失败。");

  const identity = await fetchJson(
    `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${encodeURIComponent(token.access_token)}&code=${encodeURIComponent(code)}`
  );
  if (identity.errcode) return authCallbackHtml(null, identity.errmsg || "企业微信用户身份获取失败。");

  let detail = {};
  if (identity.user_ticket) {
    detail = await postJsonUpstream(
      `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserdetail?access_token=${encodeURIComponent(token.access_token)}`,
      { user_ticket: identity.user_ticket }
    );
  }

  const userId = identity.UserId || identity.userid || detail.userid || identity.OpenId || identity.openid;
  return authCallbackHtml(
    normalizeAuthUser({
      provider: "wecom",
      providerLabel: "企业微信",
      id: `wecom:${process.env.WECOM_CORP_ID}:${userId}`,
      nickname: detail.name || userId,
      realName: detail.name || "",
      org: detail.corp_full_name || detail.corp_name || process.env.WECOM_CORP_NAME || "企业微信组织",
      email: detail.email || "",
      mobile: detail.mobile || "",
      avatar: detail.avatar || "",
      corpId: process.env.WECOM_CORP_ID,
      userId: identity.UserId || identity.userid || "",
      openid: identity.OpenId || identity.openid || "",
      verificationStatus: identity.UserId || identity.userid ? "enterprise_verified" : "wecom_openid_bound",
      verified: Boolean(identity.UserId || identity.userid)
    })
  );
}

function normalizeAuthUser(user) {
  return {
    id: user.id,
    provider: user.provider,
    providerLabel: user.providerLabel || user.provider,
    name: user.realName || user.nickname || user.name || "未命名用户",
    nickname: user.nickname || user.name || "",
    realName: user.realName || "",
    org: user.org || "",
    email: user.email || "",
    mobile: user.mobile || "",
    avatar: user.avatar || "",
    openid: user.openid || "",
    unionid: user.unionid || "",
    corpId: user.corpId || "",
    userId: user.userId || "",
    verificationStatus: user.verificationStatus || "pending_profile",
    verified: Boolean(user.verified),
    loggedInAt: new Date().toISOString()
  };
}

function authCallbackHtml(user, error = "") {
  const payload = JSON.stringify(user || null).replace(/</g, "\\u003c");
  const message = JSON.stringify(error || "").replace(/</g, "\\u003c");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>YanPM 登录</title></head><body><script>
    const user = ${payload};
    const error = ${message};
    if (user) localStorage.setItem("yanpm-auth-v1", JSON.stringify(user));
    if (error) sessionStorage.setItem("yanpm-auth-error", error);
    location.replace("/");
  </script><p>${escapeHtml(error || "登录完成，正在返回 YanPM...")}</p></body></html>`;
}

function authUnavailableHtml(provider, reason) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${provider}未配置</title></head><body style="font-family:system-ui;padding:32px"><h1>${provider}暂未配置</h1><p>${escapeHtml(reason)}</p><p>请在服务端环境变量中配置后重启 YanPM。</p></body></html>`;
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  return await response.json();
}

async function postJsonUpstream(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return await response.json();
}

function slugId(value) {
  return String(value || "user")
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function handleAi(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  const body = await readBody(req);
  const mode = body.mode || "openai-responses";
  if (mode === "codex-test") {
    if (process.env.YANPM_ENABLE_CODEX_TEST === "0") {
      return sendJson(res, 403, { error: "Codex 临时测试通道已关闭。" });
    }
    const text = await runCodexTest({
      purpose: body.purpose,
      instruction: body.instruction,
      prompt: body.prompt || body.user || ""
    });
    return sendJson(res, 200, { text, raw: { mode: "codex-test" } });
  }
  const baseUrl = String(body.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = String(body.model || "").trim();
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || body.apiKey;

  if (!apiKey) {
    return sendJson(res, 400, { error: "缺少 API Key。可设置环境变量 AI_API_KEY / OPENAI_API_KEY，或在前端 AI 设置中填写。" });
  }

  if (!baseUrl) {
    return sendJson(res, 400, { error: "缺少 Base URL。请在前端 AI 设置中选择供应商或填写接口地址。" });
  }

  if (!model) {
    return sendJson(res, 400, { error: "缺少模型名或 Endpoint ID。请在前端 AI 设置中填写。" });
  }

  const maxTokens = normalizeMaxTokens(resolveMaxTokensForPurpose(body.purpose, body.maxTokens));
  const upstream =
    mode === "openai-chat"
      ? {
          url: buildAiEndpointUrl(baseUrl, "/chat/completions"),
          body: buildChatCompletionBody({
            baseUrl,
            model,
            instruction: body.instruction,
            prompt: body.prompt || body.user || "",
            maxTokens,
            purpose: body.purpose
          })
        }
      : {
          url: buildAiEndpointUrl(baseUrl, "/responses"),
          body: {
            model,
            input: body.prompt || body.user || "",
            ...(maxTokens ? { max_output_tokens: maxTokens } : {})
          }
        };

  const data = await postUpstream(upstream.url, upstream.body, apiKey);
  const text = extractResponseText(data);
  if (!text) return sendJson(res, 502, { error: describeEmptyAiResponse(data) });
  return sendJson(res, 200, { text, raw: data });
}

function resolveChatTemperature(baseUrl, model) {
  const text = `${baseUrl} ${model}`.toLowerCase();
  if (isKimiK26ChatModel(baseUrl, model)) return null;
  if (text.includes("moonshot") || text.includes("kimi-k2.6")) return 1;
  return 0.2;
}

function buildChatCompletionBody({ baseUrl, model, instruction, prompt, maxTokens, purpose }) {
  const body = {
    model,
    messages: [
      { role: "system", content: instruction || "你是中文 AI 项目管理助理。" },
      { role: "user", content: prompt || "" }
    ]
  };
  const temperature = resolveChatTemperature(baseUrl, model);
  if (temperature !== null) body.temperature = temperature;
  if (maxTokens) {
    if (isKimiK26ChatModel(baseUrl, model)) body.max_completion_tokens = maxTokens;
    else body.max_tokens = maxTokens;
  }
  if (isKimiK26ChatModel(baseUrl, model) && ["connection-test", "manual-output-test"].includes(purpose)) {
    body.thinking = { type: "disabled" };
  }
  return body;
}

function isKimiK26ChatModel(baseUrl, model) {
  const text = `${baseUrl} ${model}`.toLowerCase();
  return (text.includes("moonshot") || text.includes("kimi")) && /kimi-k2\.[56]/.test(text);
}

function normalizeMaxTokens(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(Math.max(Math.round(parsed), 16), 4096);
}

function defaultMaxTokensForPurpose(purpose) {
  if (purpose === "connection-test") return 32;
  if (purpose === "manual-output-test") return 800;
  return null;
}

function resolveMaxTokensForPurpose(purpose, requested) {
  const fallback = defaultMaxTokensForPurpose(purpose);
  if (purpose === "manual-output-test") {
    const parsed = Number(requested);
    return Math.max(Number.isFinite(parsed) ? parsed : 0, fallback || 800);
  }
  return requested || fallback;
}

async function runCodexTest({ purpose, instruction, prompt }) {
  const finalPrompt = [
    "你是 YanPM 开发测试期临时接入的 Codex 模型通道。",
    "只完成项目管理信息理解、问答、拆解和 JSON 生成，不要修改本地文件。",
    instruction ? `\n系统要求：\n${instruction}` : "",
    purpose ? `\n任务类型：${purpose}` : "",
    "\n输入内容：",
    prompt || ""
  ].join("\n");

  const attempts = [
    ["exec", "-s", "read-only", "-a", "never", "--skip-git-repo-check", "--ephemeral", "-C", root, "-"],
    ["exec", "--skip-git-repo-check", "--ephemeral", "-C", root, "-"],
    ["exec", "-"]
  ];

  let lastError = null;
  for (const args of attempts) {
    try {
      return await runCodexCommand(args, finalPrompt);
    } catch (error) {
      lastError = error;
      if (!/unexpected argument|unknown option|unrecognized option|Usage:/i.test(error.message || "")) break;
    }
  }
  throw lastError || new Error("Codex 临时测试调用失败");
}

function runCodexCommand(args, finalPrompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(codexCommand, args, {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Codex 临时测试超过 ${codexTimeoutMs / 1000} 秒未返回`));
    }, codexTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`无法启动 Codex CLI：${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = extractCodexFinalText(stdout).trim();
      if (code === 0 && text) {
        resolve(text);
        return;
      }
      const reason = stderr.trim() || stdout.trim() || `Codex CLI 退出码 ${code}`;
      reject(new Error(reason));
    });

    child.stdin.end(finalPrompt);
  });
}

function extractCodexFinalText(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  const jsonMessages = [];
  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      if (item?.type === "message" && item.message?.role === "assistant") {
        const content = Array.isArray(item.message.content) ? item.message.content : [];
        const text = content
          .map((part) => part.text || part.content || "")
          .filter(Boolean)
          .join("\n");
        if (text) jsonMessages.push(text);
      }
      if (typeof item?.message === "string") jsonMessages.push(item.message);
      if (typeof item?.text === "string") jsonMessages.push(item.text);
    } catch {
      // Codex CLI usually prints plain final text unless JSON mode is enabled.
    }
  }
  return jsonMessages.at(-1) || lines.join("\n");
}

function buildAiEndpointUrl(baseUrl, suffix) {
  const cleanBase = String(baseUrl || "").trim().replace(/\/+$/, "");
  const cleanSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  if (cleanBase.endsWith(cleanSuffix)) return cleanBase;
  return `${cleanBase}${cleanSuffix}`;
}

async function postUpstream(url, body, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), aiTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || `HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`AI 请求超过 ${aiTimeoutMs / 1000} 秒未返回`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractResponseText(data) {
  const parts = [];
  appendTextPart(parts, data?.output_text);
  appendTextPart(parts, data?.text);
  for (const choice of data?.choices || []) {
    appendTextPart(parts, choice?.message?.content);
    appendTextPart(parts, choice?.delta?.content);
    appendTextPart(parts, choice?.text);
  }
  for (const item of data?.output || []) {
    appendTextPart(parts, item?.content);
    appendTextPart(parts, item?.output_text);
    appendTextPart(parts, item?.text);
  }
  return parts.filter(Boolean).join("\n").trim();
}

function appendTextPart(parts, value) {
  if (!value) return;
  if (typeof value === "string") {
    const text = value.trim();
    if (text) parts.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) appendTextPart(parts, item);
    return;
  }
  if (typeof value !== "object") return;
  appendTextPart(parts, value.text);
  appendTextPart(parts, value.output_text);
  appendTextPart(parts, value.content);
}

function describeEmptyAiResponse(data) {
  const message = data?.error?.message || data?.message;
  if (message) return `模型接口返回错误：${message}`;

  const finishReason = data?.choices?.[0]?.finish_reason || data?.choices?.[0]?.finishReason;
  const status = data?.status || data?.incomplete_details?.reason;
  const details = [finishReason ? `finish_reason=${finishReason}` : "", status ? `status=${status}` : ""]
    .filter(Boolean)
    .join("，");
  const suffix = details ? `（${details}）` : "";
  return `模型请求已返回，但没有可展示文本${suffix}。请确认当前模型支持所选运行模式，或先改用 kimi-latest / moonshot-v1-8k 再测试。`;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const target = path.normalize(path.join(root, requested));

  if (!target.startsWith(root)) return sendText(res, 403, "Forbidden");

  try {
    const bytes = await readFile(target);
    const type = mimeTypes[path.extname(target)] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store"
    });
    res.end(bytes);
  } catch {
    sendText(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/health") return sendJson(res, 200, { ok: true, storage: "file", aiProxy: true });
    if (url.pathname === "/api/state") return await handleState(req, res);
    if (url.pathname === "/api/ai") return await handleAi(req, res);
    if (url.pathname.startsWith("/api/auth/")) return await handleAuth(req, res, url);
    return await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, host, () => {
  console.log(`YanPM running at http://${host}:${port}`);
});
