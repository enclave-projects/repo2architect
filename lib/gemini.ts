import { GoogleGenAI } from '@google/genai';
import type { DependencyGraph } from './graph';
import { graphToPromptContext } from './graph';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeminiAnalysis {
  architectureAnalysis: string;
  prdDraft: string;
  model: string;
}

// ── Client factory (lazy singleton) ──────────────────────────────────────────

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

function getModel(): string {
  return process.env.GEMINI_MODEL ?? 'gemma-4-31b-it';
}

// ── Prompts ───────────────────────────────────────────────────────────────────

function buildArchitecturePrompt(graphContext: string, repoUrl: string): string {
  return `You are a senior software architect performing a codebase analysis.

Repository: ${repoUrl}

${graphContext}

## Task
Analyze the dependency graph and module relationships above.

1. Infer the likely high-level software architecture pattern (e.g., MVC, Clean Architecture, Microservices, Monolith, Event-Driven, Layered, Hexagonal/Ports-and-Adapters, etc.).
2. Identify the core components and how they interact.
3. Call out any architectural risks, code smells, or circular dependency concerns.
4. Explain your reasoning clearly.

Respond in structured Markdown with sections: ## Architecture Pattern, ## Core Components, ## Component Interactions, ## Risks & Observations.`;
}

function buildPrdPrompt(
  graphContext: string,
  repoUrl: string,
  configSummary: string
): string {
  return `You are a technical product manager tasked with reverse-engineering a Product Requirements Document from an existing codebase.

Repository: ${repoUrl}

${graphContext}

## Configuration & Dependencies
${configSummary}

## Task
Based on the project structure, dependencies, entry points, and configuration files:

1. Draft the **Problem Statement** section: What problem does this software solve? Who are the likely users?
2. Draft the **Key Features** section: List the top 5–8 features inferred from the codebase (modules, endpoints, dependencies).
3. Draft the **Technical Stack** section: Languages, frameworks, notable libraries.

Respond in structured Markdown with sections: ## Problem Statement, ## Key Features, ## Technical Stack.`;
}

// ── External deps → config summary ───────────────────────────────────────────

function buildConfigSummary(graph: DependencyGraph): string {
  const deps = graph.stats.externalDeps;
  if (deps.length === 0) return 'No external dependencies detected.';
  const lines = [
    `External packages (${deps.length} detected):`,
    deps.slice(0, 40).join(', '),
  ];
  return lines.join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run both Gemini prompts against the dependency graph and return structured analysis.
 */
export async function analyzeWithGemini(
  graph: DependencyGraph,
  repoUrl: string
): Promise<GeminiAnalysis> {
  const client = getClient();
  const model  = getModel();
  const graphContext   = graphToPromptContext(graph);
  const configSummary  = buildConfigSummary(graph);

  const archPrompt = buildArchitecturePrompt(graphContext, repoUrl);
  const prdPrompt  = buildPrdPrompt(graphContext, repoUrl, configSummary);

  // Run both prompts concurrently for speed
  const [archResponse, prdResponse] = await Promise.all([
    client.models.generateContent({ model, contents: archPrompt }),
    client.models.generateContent({ model, contents: prdPrompt }),
  ]);

  const architectureAnalysis = archResponse.text ?? '(no response)';
  const prdDraft             = prdResponse.text  ?? '(no response)';

  return { architectureAnalysis, prdDraft, model };
}
