FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN yarn install --immutable

# Copy source and build
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/

RUN yarn workspace @zyno-io/dag-shared build
RUN yarn workspace @zyno-io/dag build

# Production dependencies
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN yarn workspaces focus @zyno-io/dag --production

# Production image
FROM node:22-alpine

RUN apk add --no-cache git

RUN addgroup -g 1001 -S app && adduser -S app -u 1001
WORKDIR /app

COPY --from=deps /app/package.json /app/yarn.lock /app/.yarnrc.yml ./
COPY --from=deps /app/.yarn .yarn
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/packages/shared/package.json packages/shared/
COPY --from=deps /app/packages/server/package.json packages/server/
COPY --from=deps /app/packages/server/node_modules packages/server/node_modules
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/server/dist packages/server/dist

USER app

EXPOSE 3000

CMD ["node", "packages/server/dist/bootstrap.js"]
