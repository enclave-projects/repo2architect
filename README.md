# Repo2Architect 🚀

Repo2Architect is an autonomous analysis pipeline that transforms public GitHub repositories into comprehensive Architectural PRDs, dependency graphs, and Mermaid diagrams utilizing AST Parsing and Google Gemini 3.1 Pro.

## Features

- **AST Parsing Engine (TypeScript / JS):** Safely extracts exact dependencies, imports, and exports from huge codebases.
- **Ai Agentic Insights:** Employs `gemini-3.1-pro-preview` to formulate high-level PRD drafts out of chaotic structures.
- **Visual Mermaid Renderings:** Automatically produces deep interactive modular breakdown diagrams.
- **Export Hub:** Extract your analysis in Markdown, standalone Diagrams, structured JSON, or a fully automated ZIP archive.
- **Bot/CLI Prompts:** Generates dynamic system prompts tailored for *Claude Code*, *Google Antigravity*, and *Gemini CLI* configurations.

## Tech Stack

- **Framework:** Next.js 16+ (App Router)
- **AI Integration:** `@google/genai` (Native Interaction via Gemini 3.1 APIs)
- **Parsing:** `@typescript-eslint/typescript-estree`
- **Output:** `archiver`, `mermaid`
- **Security Additions:** `dompurify` (React SVG filtering), `rate-limiter-flexible` (Edge DDoS throttling)

## Security Posture & Architecture 🛡️

The application is inherently **ephemeral and stateless**:
- Target repositories are downloaded via shallow Git clones using strictly separated argument arrays (`child_process.spawn`) mapped into isolated system temp directories.
- AST parsing incorporates cyclic limits and hard stops out at 10,000 source files to protect against main-thread DoS exhaustion.
- Mermaid SVG diagrams bypass XSS vulnerabilities securely mapped through Isomorphic Client DOMPurifiers. 
- A rigorous 60-second AbortController timeout wraps the analysis pipelines guarding against abusive cryptojacking payloads.

## Environmental Setup

Create a `.env.local` inside the root and configure Google Gemini:
```env
GEMINI_API_KEY="your-gemini-key"
```

Then boot the application:
```bash
npm run dev
```

Navigate to [http://localhost:3000](http://localhost:3000) to scan your first repository.

## Getting Started

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

# repo2architect
