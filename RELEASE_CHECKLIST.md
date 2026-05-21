# YanPM Web v1 Release Checklist

## Product scope

- Web App is the primary release surface.
- WeChat Open Platform and Enterprise WeChat are used only for identity binding.
- API keys and model provider credentials stay on the server side.
- Mini Program release is intentionally out of scope for v1.

## Required production configuration

- Set `YANPM_PUBLIC_URL` to the HTTPS production origin.
- Set `AUTH_DEV_MODE=0` if self-attested local login should be disabled.
- Set `YANPM_ENABLE_CODEX_TEST=0` before public launch.
- Configure at least one identity provider:
  - WeChat Open Platform website app: `WECHAT_WEB_APP_ID`, `WECHAT_WEB_APP_SECRET`
  - Enterprise WeChat: `WECOM_CORP_ID`, `WECOM_AGENT_ID`, `WECOM_APP_SECRET`
- Configure AI model credentials only on the server:
  - `AI_API_KEY` or provider-specific proxy variables

## WeChat / WeCom setup

- WeChat Open Platform callback:
  - `${YANPM_PUBLIC_URL}/api/auth/wechat/callback`
- Enterprise WeChat callback:
  - `${YANPM_PUBLIC_URL}/api/auth/wecom/callback`
- Confirm that provider domain callbacks use HTTPS in production.
- Confirm that first login requires real name plus mobile or enterprise email.
- Confirm that audit logs show the real name first, not only WeChat nickname.

## Security and privacy

- Do not expose AI API keys in browser storage.
- Do not keep `Codex 临时测试` enabled in public production.
- Publish a privacy policy covering:
  - WeChat / Enterprise WeChat identity data
  - Real name, phone, and enterprise email
  - Meeting text, uploaded files, and recordings
  - AI processing and audit logs
- Restrict audit log export to administrators in the production backend.
- Move state and audit storage from local JSON to a database before team rollout.

## Functional acceptance

- Web login button opens the configured provider.
- Callback returns to the app and stores the authenticated identity.
- User can complete real name, organization, phone or email.
- Audit logs record login, logout, task changes, risk changes, proposal confirmation, import/export, archive/restore.
- AI settings can test the selected production model through server proxy.
- Task dependencies can be selected from existing tasks.
- Desktop, tablet, and mobile widths render without overlapping the global input.

## Pre-release commands

```bash
npm run release:check
```

Then start the production process with the configured environment:

```bash
node server.mjs
```
