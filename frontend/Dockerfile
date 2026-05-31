FROM node:20-bullseye-slim AS base

# Install dependencies only when needed
FROM base AS deps
# No need for libc6-compat on debian
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm install

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Environment variables must be present at build time for Next.js to inline them if they are NEXT_PUBLIC_
# However, we can also pass them at runtime if using runtime configuration, but standalone output bakes NEXT_PUBLIC_ vars.
# To support dynamic NEXT_PUBLIC_API_URL, we'll build it without it and use a custom entrypoint or just provide it at runtime (Next.js standalone respects env vars at runtime for NEXT_PUBLIC if accessed correctly, but it's tricky. Let's just pass a placeholder and we can configure it).
# Wait, actually Next.js standalone DOES read process.env at runtime even for NEXT_PUBLIC if it's not statically optimized. Let's just build.
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
