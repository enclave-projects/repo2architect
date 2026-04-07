<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Next.js Best Practices & Cache Components
1. **Cache Components (Next.js 16+)**: Enable via `cacheComponents: true` in `next.config.ts`.
2. **Three Content Types**: Static (Auto-prerendered), Cached (`'use cache'`), Dynamic (Suspense).
3. **`'use cache'` Directive**: Use at file, component, or function level. Pair with `cacheLife({ ... })` or built-in profiles like `cacheLife('hours')`.
4. **Cache Invalidation**: Use `cacheTag('tag')` to tag, and `updateTag('tag')` (immediate) or `revalidateTag('tag')` (background) to invalidate.
5. **No Runtime APIs in Cache**: `cookies()`, `headers()`, and `searchParams` cannot be used inside `use cache` functions (except with `'use cache: private'`). Pass them as arguments!
6. **Async Patterns**: `params`, `searchParams`, `cookies()`, `headers()` are all heavily async. Unpack them with `await`.
7. **Directives**: Understand `'use client'`, `'use server'`, and the new `'use cache'`.

## Upgrading Next.js
- Use `npx @next/codemod@latest <transform> <path>`
- Regularly check the official Next.js upgrade guides.
- After upgrading dependency versions, run `npm install next@latest react@latest react-dom@latest`.
<!-- END:nextjs-agent-rules -->

# Repo2Architect Security & Operation Practices

When interacting with Repo2Architect backend systems:
1. **Malware/Injection Protections:** `exec` operations are explicitly banned. Any system or Git invocations must interact directly through parameterized `child_process.spawn`.
2. **Node.js Threads:** Deep AST parsing operations (via `@typescript-eslint/typescript-estree`) must continuously yield to the Node event loop using `setImmediate` or Worker boundaries to prevent dropping active external requests.
3. **Limits:** Hard caps on repositories (10,000 files) and execution limits (60s) via `AbortController/Promise.race` must be strictly respected.
4. **SVG Manipulation:** `DOMPurify` overrides MUST be utilized anytime manipulating raw string graphs exported to the browser.
5. **DDoS Protection:** Always consider isolated Node mapping boundaries for scaling `middleware.ts` Edge deployments using `Upstash` or isolated standard tracking mechanisms.
