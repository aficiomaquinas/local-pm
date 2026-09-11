# Disposable dev IdP for the local-pm E2E stack (docker-compose.e2e.yml).
# Intentionally NOT part of the pnpm workspace (pnpm-workspace.yaml only
# covers apps/* and packages/*): npm installs its own deps at image build,
# keeping the service self-contained and the root lockfile untouched.
FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

ENV PORT=5558
EXPOSE 5558

CMD ["node", "server.mjs"]
