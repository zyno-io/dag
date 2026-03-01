FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY packages/shared/package.json packages/shared/
COPY packages/cli/package.json packages/cli/

RUN yarn install --immutable

# Copy source and build
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/cli/ packages/cli/

RUN yarn workspace @zyno-io/dag-shared build
RUN yarn workspace @zyno-io/dag-cli build

ENTRYPOINT ["node", "packages/cli/dist/index.js"]
