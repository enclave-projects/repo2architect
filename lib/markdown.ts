import type { DependencyGraph } from './graph';
import type { GeminiAnalysis } from './gemini';
import { mermaidToMarkdownBlock } from './mermaid';

/**
 * Build a clean, combined Markdown document from all analysis artifacts.
 * This is the "full documentation" export described in Phase 3.
 */
export function buildCombinedMarkdown(opts: {
  repoUrl: string;
  graph: DependencyGraph;
  geminiAnalysis: GeminiAnalysis;
  mermaidDiagram: string;
  generatedAt?: Date;
}): string {
  const { repoUrl, graph, geminiAnalysis, mermaidDiagram, generatedAt = new Date() } = opts;

  const repoName = repoUrl.split('/').slice(-2).join('/');
  const dateStr = generatedAt.toUTCString();

  const sections: string[] = [];

  // ── Title & Metadata ──────────────────────────────────────────────────────
  sections.push(`# Repo2Architect Report: ${repoName}`);
  sections.push('');
  sections.push(`> **Source:** ${repoUrl}  `);
  sections.push(`> **Generated:** ${dateStr}  `);
  sections.push(`> **Analysis Model:** ${geminiAnalysis.model}`);
  sections.push('');
  sections.push('---');
  sections.push('');

  // ── Table of Contents ─────────────────────────────────────────────────────
  sections.push('## Table of Contents');
  sections.push('');
  sections.push('1. [Repository Statistics](#1-repository-statistics)');
  sections.push('2. [Architecture Analysis](#2-architecture-analysis)');
  sections.push('3. [Product Requirements Draft](#3-product-requirements-draft)');
  sections.push('4. [Dependency Diagram](#4-dependency-diagram)');
  sections.push('5. [Dependency Graph Details](#5-dependency-graph-details)');
  sections.push('');
  sections.push('---');
  sections.push('');

  // ── 1. Repository Statistics ──────────────────────────────────────────────
  sections.push('## 1. Repository Statistics');
  sections.push('');
  sections.push('| Metric | Value |');
  sections.push('|--------|-------|');
  sections.push(`| Total Source Files | ${graph.stats.totalFiles} |`);
  sections.push(`| TypeScript Files | ${graph.stats.tsFiles} |`);
  sections.push(`| JavaScript Files | ${graph.stats.jsFiles} |`);
  sections.push(`| JSON Files | ${graph.stats.jsonFiles} |`);
  sections.push(`| Dependency Edges | ${graph.stats.totalEdges} |`);
  sections.push(`| External Packages | ${graph.stats.externalDeps.length} |`);
  sections.push(`| Circular Dependencies | ${graph.circularDeps.length} |`);
  sections.push('');

  if (graph.coreModules.length > 0) {
    sections.push('### Core Modules (by import frequency)');
    sections.push('');
    graph.coreModules.forEach((m, i) => sections.push(`${i + 1}. \`${m}\``));
    sections.push('');
  }

  if (graph.stats.externalDeps.length > 0) {
    sections.push('### External Dependencies');
    sections.push('');
    sections.push(graph.stats.externalDeps.map(d => `\`${d}\``).join(', '));
    sections.push('');
  }

  if (graph.circularDeps.length > 0) {
    sections.push('### ⚠️ Circular Dependencies');
    sections.push('');
    graph.circularDeps.forEach(chain => {
      sections.push(`- ${chain.join(' → ')}`);
    });
    sections.push('');
  }

  sections.push('---');
  sections.push('');

  // ── 2. Architecture Analysis ──────────────────────────────────────────────
  sections.push('## 2. Architecture Analysis');
  sections.push('');
  sections.push(geminiAnalysis.architectureAnalysis);
  sections.push('');
  sections.push('---');
  sections.push('');

  // ── 3. PRD Draft ──────────────────────────────────────────────────────────
  sections.push('## 3. Product Requirements Draft');
  sections.push('');
  sections.push(geminiAnalysis.prdDraft);
  sections.push('');
  sections.push('---');
  sections.push('');

  // ── 4. Dependency Diagram ─────────────────────────────────────────────────
  sections.push('## 4. Dependency Diagram');
  sections.push('');
  sections.push('> The diagram below shows the top modules by import frequency.');
  sections.push('> Core modules (most imported) are highlighted in indigo.');
  sections.push('');
  sections.push(mermaidToMarkdownBlock(mermaidDiagram));
  sections.push('');
  sections.push('---');
  sections.push('');

  // ── 5. Graph Details ──────────────────────────────────────────────────────
  sections.push('## 5. Dependency Graph Details');
  sections.push('');
  sections.push('### Top 50 Modules');
  sections.push('');
  sections.push('| # | Module | Language | In-Degree | Out-Degree |');
  sections.push('|---|--------|----------|-----------|------------|');
  graph.nodes
    .sort((a, b) => b.inDegree - a.inDegree)
    .slice(0, 50)
    .forEach((n, i) => {
      sections.push(`| ${i + 1} | \`${n.id}\` | ${n.language} | ${n.inDegree} | ${n.outDegree} |`);
    });
  sections.push('');

  return sections.join('\n');
}

/**
 * Build the full structured JSON export object.
 */
export function buildJsonExport(opts: {
  repoUrl: string;
  graph: DependencyGraph;
  geminiAnalysis: GeminiAnalysis;
  mermaidDiagram: string;
  generatedAt?: Date;
}): object {
  const { repoUrl, graph, geminiAnalysis, mermaidDiagram, generatedAt = new Date() } = opts;

  return {
    meta: {
      repoUrl,
      repoName: repoUrl.split('/').slice(-2).join('/'),
      generatedAt: generatedAt.toISOString(),
      analysisModel: geminiAnalysis.model,
      version: '2.0.0',
    },
    stats: graph.stats,
    coreModules: graph.coreModules,
    circularDependencies: graph.circularDeps,
    nodes: graph.nodes.map(n => ({
      id: n.id,
      language: n.language,
      inDegree: n.inDegree,
      outDegree: n.outDegree,
      exports: n.exports,
    })),
    edges: graph.edges,
    aiAnalysis: {
      architectureInference: geminiAnalysis.architectureAnalysis,
      prdDraft: geminiAnalysis.prdDraft,
    },
    diagram: {
      type: 'mermaid',
      syntax: 'graph TD',
      code: mermaidDiagram,
    },
  };
}
