FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY index.html styles.css app.js server.mjs ./
COPY README.md RELEASE_CHECKLIST.md PRIVACY_DRAFT.md ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

EXPOSE 8787

CMD ["node", "server.mjs"]
