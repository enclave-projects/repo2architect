@AGENTS.md

# Project Directives
- **Next.js 16+ Cache Components:** We use the newer `'use cache'` directive. Keep dynamic runtime APIs (like `cookies()` or `headers()`) out of cached boundaries.
- **Async Request APIs:** `params`, `searchParams`, `headers()`, and `cookies()` are asynchronous.
- **Upgrades:** Consult standard guides and rely on `@next/codemod` before performing upgrades.

## Repo2Architect Architecture & Security Posture
- **XSS Mitigations:** When injecting arbitrary or external SVG configurations (like Mermaid exports), always leverage `DOMPurify.sanitize(data)` on client components.
- **Git Cloning Constraints:** NEVER use `exec` or `execAsync` to invoke system shell cloning. Always stick to isolated string arrays passed directly into `child_process.spawn`.
- **DoS & Timeout Constraints:** The AST parsing engine MUST enforce a hard-cap of 10,000 files to prevent pipeline freezing. Long-acting async methods inside `app/api/route.ts` must use execution yields built on `setImmediate` and wrap execution inside `Promise.race` limited to 60-second timeouts.
