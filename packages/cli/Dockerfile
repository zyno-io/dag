FROM node:22-alpine AS builder

WORKDIR /app

# Install all dependencies (needed for build)
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY packages/shared/package.json packages/shared/
COPY packages/cli/package.json packages/cli/
COPY packages/server/package.json packages/server/

RUN yarn install --immutable

# Copy source and build
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/cli/ packages/cli/

RUN yarn workspace @zyno-io/dag-shared build
RUN yarn workspace @zyno-io/dag-cli build

# Production stage
FROM node:22-alpine

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY packages/shared/package.json packages/shared/
COPY packages/cli/package.json packages/cli/
COPY packages/server/package.json packages/server/

RUN yarn workspaces focus @zyno-io/dag-cli --production

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/cli/dist packages/cli/dist

RUN chmod +x packages/cli/dist/index.js packages/cli/dist/inject-values.js && \
    ln -s /app/packages/cli/dist/index.js /usr/local/bin/dag-deploy && \
    ln -s /app/packages/cli/dist/inject-values.js /usr/local/bin/dag-inject-values

CMD ["node", "packages/cli/dist/index.js"]
