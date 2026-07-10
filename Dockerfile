# Use Bun's official image as base
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies into a temp directory
# This will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Copy node_modules from temp directory
# Then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# Copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /app/src ./src
COPY --from=prerelease /app/index.ts .
COPY --from=prerelease /app/package.json .
COPY --from=prerelease /app/tsconfig.json .

# The app listens on $PORT (injected by the platform), falling back to 5000
EXPOSE 5000

# Set environment to production
ENV NODE_ENV=production

# Run the app
USER bun
CMD ["bun", "run", "index.ts"]
