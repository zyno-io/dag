FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies. Every workspace's package.json must be present or the immutable
# install will reject the lockfile.
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY packages/ui/package.json packages/ui/

RUN yarn install --immutable

# Copy source and build
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/ui/ packages/ui/

RUN yarn workspace @zyno-io/dag-shared build
RUN yarn workspace @zyno-io/dag build

# The management UI is typed against the server's OpenAPI schema, so the schema is dumped from
# the freshly built server (no database needed) and the client generated from it. The UI build
# then emits straight into packages/server/static, which the server serves.
RUN yarn workspace @zyno-io/dag openapi
RUN yarn workspace @zyno-io/dag-ui gen
RUN yarn workspace @zyno-io/dag-ui build

# Production dependencies
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY packages/ui/package.json packages/ui/

RUN yarn workspaces focus @zyno-io/dag --production

# Production image
FROM node:24-alpine

RUN apk add --no-cache git

RUN addgroup -g 1001 -S app && adduser -S app -u 1001

USER app
WORKDIR /app

COPY --chown=app:app --from=deps /app/package.json /app/yarn.lock /app/.yarnrc.yml ./
COPY --chown=app:app --from=deps /app/.yarn .yarn
COPY --chown=app:app --from=deps /app/node_modules node_modules
COPY --chown=app:app --from=deps /app/packages/shared/package.json packages/shared/
COPY --chown=app:app --from=deps /app/packages/server/package.json packages/server/
COPY --chown=app:app --from=deps /app/packages/server/node_modules packages/server/node_modules
COPY --chown=app:app --from=builder /app/packages/shared/dist packages/shared/dist
COPY --chown=app:app --from=builder /app/packages/server/dist packages/server/dist
COPY --chown=app:app --from=builder /app/packages/server/static packages/server/static

WORKDIR /app/packages/server

RUN node -e "require('@zyno-io/ts-server-foundation/otel')"

EXPOSE 3000

CMD ["node", "dist/bootstrap.js", "server:start"]
