import { getStore } from "@netlify/blobs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const aiTimeoutMs = Number(process.env.AI_TIMEOUT_MS || 20000);
const authDevMode = process.env.AUTH_DEV_MODE !== "0";

export async function handler(event) {
  try {
    const requestUrl = buildRequestUrl(event);
    const url = new URL(requestUrl);
    const pathname = normalizeApiPath(event.path || url.pathname);

    if (pathname === "/api/health") return json(200, { ok: true, storage: "netlify-blobs", aiProxy: true });
    if (pathname === "/api/state") return await handleState(event);
    if (pathname === "/api/ai") return await handleAi(event);
    if (pathname.startsWith("/api/auth/")) return await handleAuth(event, pathname, url);

    return json(404, { error: "API endpoint not found" });
  } catch (error) {
    return json(500, { error: error.message || "Server error" });
  }
}

function buildRequestUrl(event) {
  if (event.rawUrl) return event.rawUrl;
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.host || process.env.URL?.replace(/^https?:\/\//, "") || "localhost";
  const query = event.rawQuery ? `?${event.rawQuery}` : "";
  return `${proto}://${host}${event.path || "/"}${query}`;
}

function normalizeApiPath(pathname) {
  const prefix = "/.netlify/functions/api";
  if (pathname.startsWith(prefix)) {
    const suffix = pathname.slice(prefix.length);
    return `/api${suffix.startsWith("/") ? suffix : `/${suffix}`}`.replace(/\/+$/, "") || "/api";
  }
  if (pathname.startsWith("/api/")) return pathname.replace(/\/+$/, "");
  if (pathname === "/api") return pathname;
  return `/api/${pathname.replace(/^\/+/, "")}`.replace(/\/+$/, "");
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function html(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body
  };
}

function redirect(location) {
  return {
    statusCode: 302,
    headers: { Location: location },
    body: ""
  };
}

async function readBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  if (raw.length > 2_000_000) throw new Error("请求体过大");
  return raw ? JSON.parse(raw) : {};
}

async function handleState(event) {
  const store = getStore("yanpm-state");
  if (event.httpMethod === "GET") {
    const state = await store.get("state", { type: "json", consistency: "strong" });
    return json(200, { state: state || null });
  }

  if (event.httpMethod === "POST") {
    const body = await readBody(event);
    await store.setJSON("state", body.state || body);
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed" });
}

async function handleAi(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const body = await readBody(event);
  const mode = body.mode || "openai-responses";

  if (mode === "codex-test") {
    return json(403, { error: "Netlify 测试环境不支持 Codex 临时通道，请选择真实模型 API 或本地模拟。" });
  }

  const baseUrl = String(body.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = String(body.model || "").trim();
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || body.apiKey;

  if (!apiKey) {
    return json(400, { error: "缺少 API Key。可在 Netlify 环境变量中设置 AI_API_KEY，或在前端 AI 设置中填写。" });
  }

  if (!baseUrl) return json(400, { error: "缺少 Base URL。请在前端 AI 设置中选择供应商或填写接口地址。" });
  if (!model) return json(400, { error: "缺少模型名或 Endpoint ID。请在前端 AI 设置中填写。" });

  const upstream =
    mode === "openai-chat"
      ? {
          url: buildAiEndpointUrl(baseUrl, "/chat/completions"),
          body: {
            model,
            messages: [
              { role: "system", content: body.instruction || "你是中文 AI 项目管理助理。" },
              { role: "user", content: body.prompt || body.user || "" }
            ],
            temperature: resolveChatTemperature(baseUrl, model)
          }
        }
      : {
          url: buildAiEndpointUrl(baseUrl, "/responses"),
          body: {
            model,
            input: body.prompt || body.user || ""
          }
        };

  const data = await postUpstream(upstream.url, upstream.body, apiKey);
  return json(200, { text: extractResponseText(data), raw: data });
}

async function handleAuth(event, pathname, url) {
  if (pathname === "/api/auth/config") return json(200, buildAuthConfig(event));

  if (pathname === "/api/auth/dev") {
    if (!authDevMode) return json(403, { error: "开发登录已关闭。" });
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    const body = await readBody(event);
    return json(200, {
      user: normalizeAuthUser({
        provider: body.provider || "dev",
        providerLabel: body.providerLabel || "开发模式",
        id: `dev:${slugId(body.realName || body.name || "user")}`,
        nickname: body.name || body.realName || "开发用户",
        realName: body.realName || body.name || "开发用户",
        org: body.org || "测试组织",
        email: body.email || "",
        mobile: body.mobile || "",
        verificationStatus: "self_attested",
        verified: Boolean(body.realName || body.mobile || body.email)
      })
    });
  }

  if (pathname === "/api/auth/wechat/start") {
    const config = buildAuthConfig(event).wechat;
    if (!config.enabled) return html(200, authUnavailableHtml("微信开放平台", config.reason));
    return redirect(buildWechatAuthorizeUrl(event));
  }

  if (pathname === "/api/auth/wecom/start") {
    const config = buildAuthConfig(event).wecom;
    if (!config.enabled) return html(200, authUnavailableHtml("企业微信", config.reason));
    return redirect(buildWecomAuthorizeUrl(event));
  }

  if (pathname === "/api/auth/wechat/callback") return html(200, await finishWechatAuth(url, event));
  if (pathname === "/api/auth/wecom/callback") return html(200, await finishWecomAuth(url, event));

  return json(404, { error: "Auth endpoint not found" });
}

function publicUrlFromEvent(event) {
  const configured = process.env.YANPM_PUBLIC_URL || process.env.URL;
  if (configured) return configured.replace(/\/+$/, "");
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.host || "localhost";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function buildAuthConfig(event) {
  const publicUrl = publicUrlFromEvent(event);
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

function buildWechatAuthorizeUrl(event) {
  const state = createOauthState("wechat");
  const redirectUri = process.env.WECHAT_WEB_REDIRECT_URI || `${publicUrlFromEvent(event)}/api/auth/wechat/callback`;
  return `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(process.env.WECHAT_WEB_APP_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_login&state=${encodeURIComponent(state)}#wechat_redirect`;
}

function buildWecomAuthorizeUrl(event) {
  const state = createOauthState("wecom");
  const redirectUri = process.env.WECOM_REDIRECT_URI || `${publicUrlFromEvent(event)}/api/auth/wecom/callback`;
  const corpId = encodeURIComponent(process.env.WECOM_CORP_ID);
  const agentId = encodeURIComponent(process.env.WECOM_AGENT_ID);
  if (process.env.WECOM_LOGIN_MODE === "qr") {
    return `https://login.work.weixin.qq.com/wwlogin/sso/qrConnect?appid=${corpId}&agentid=${agentId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  }
  const scope = encodeURIComponent(process.env.WECOM_OAUTH_SCOPE || "snsapi_privateinfo");
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${corpId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}&agentid=${agentId}#wechat_redirect`;
}

function createOauthState(provider) {
  const payload = `${provider}.${Date.now()}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${signState(payload)}`;
}

function consumeOauthState(provider, value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 4) return false;
  const [stateProvider, timestamp] = parts;
  const payload = parts.slice(0, 3).join(".");
  const signature = parts[3];
  if (stateProvider !== provider) return false;
  if (Date.now() - Number(timestamp) > 10 * 60 * 1000) return false;
  return timingSafeEqualString(signature, signState(payload));
}

function signState(payload) {
  const secret = process.env.AUTH_STATE_SECRET || process.env.SITE_ID || "yanpm-netlify-test-secret";
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
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
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${provider}未配置</title></head><body style="font-family:system-ui;padding:32px"><h1>${provider}暂未配置</h1><p>${escapeHtml(reason)}</p><p>请在 Netlify 环境变量中配置后重新部署 YanPM。</p></body></html>`;
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

function resolveChatTemperature(baseUrl, model) {
  const text = `${baseUrl} ${model}`.toLowerCase();
  if (text.includes("moonshot") || text.includes("kimi-k2.6")) return 1;
  return 0.2;
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
    if (!response.ok) throw new Error(data?.error?.message || data?.message || `HTTP ${response.status}`);
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`AI 请求超过 ${aiTimeoutMs / 1000} 秒未返回`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractResponseText(data) {
  if (data?.output_text) return data.output_text;
  if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item.content || []) {
      if (content.text) parts.push(content.text);
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}
