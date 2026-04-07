import type { ParsedModule } from './parser';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;            // relative file path (unique key)
  imports: string[];     // all raw specifiers this node imports
  exports: string[];     // names this node exports
  language: string;
  inDegree: number;      // how many other nodes import this
  outDegree: number;     // how many modules this node imports
}

export interface GraphEdge {
  from: string;          // importer id
  to: string;            // importee id (resolved) or raw specifier
  specifier: string;     // original import string
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** modules with the highest in-degree (most imported) */
  coreModules: string[];
  /** detected circular dependency chains */
  circularDeps: string[][];
  /** aggregate stats */
  stats: {
    totalFiles: number;
    tsFiles: number;
    jsFiles: number;
    jsonFiles: number;
    totalEdges: number;
    externalDeps: string[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Very simple relative-path resolver: turn "./foo" relative to `from` into an id */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  // External package (no leading ./ or /)
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;

  const fromDir = fromFile.includes('/') ? fromFile.substring(0, fromFile.lastIndexOf('/')) : '';
  const joined = fromDir ? `${fromDir}/${specifier}` : specifier;

  // Normalize ".." segments (lightweight, no fs access)
  const parts: string[] = [];
  for (const seg of joined.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/** Detect cycles via DFS; returns arrays of node ids forming cycles */
function detectCycles(adj: Map<string, string[]>): string[][] {
  const visited = new Set<string>();
  const stack   = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]) {
    if (stack.has(node)) {
      const idx = path.indexOf(node);
      cycles.push(path.slice(idx));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    path.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      dfs(neighbor, [...path]);
    }
    stack.delete(node);
  }

  for (const node of adj.keys()) dfs(node, []);
  return cycles.slice(0, 10); // cap at 10 cycles
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Builds an in-memory dependency graph from parsed modules.
 */
export function buildGraph(modules: ParsedModule[]): DependencyGraph {
  // Index all known file ids (strip common extensions for loose matching)
  const fileIds = new Set(modules.map(m => m.filePath));

  const nodesMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const externalDepsSet = new Set<string>();

  // Initialise nodes
  for (const mod of modules) {
    nodesMap.set(mod.filePath, {
      id: mod.filePath,
      imports: mod.imports,
      exports: mod.exports,
      language: mod.language,
      inDegree: 0,
      outDegree: 0,
    });
  }

  // Build edges
  const adj = new Map<string, string[]>();
  for (const mod of modules) {
    adj.set(mod.filePath, []);

    for (const specifier of mod.imports) {
      const resolved = resolveSpecifier(mod.filePath, specifier);

      if (resolved === null) {
        // External dependency (npm package)
        externalDepsSet.add(specifier.split('/')[0]); // package root name
        continue;
      }

      // Try to find the resolved target with or without extension
      let targetId: string | undefined;
      const candidates = [
        resolved,
        `${resolved}.ts`, `${resolved}.tsx`,
        `${resolved}.js`, `${resolved}.jsx`,
        `${resolved}/index.ts`, `${resolved}/index.js`,
      ];
      for (const c of candidates) {
        if (fileIds.has(c)) { targetId = c; break; }
      }

      const edgeTo = targetId ?? resolved;
      edges.push({ from: mod.filePath, to: edgeTo, specifier });

      if (targetId && nodesMap.has(targetId)) {
        nodesMap.get(targetId)!.inDegree++;
        nodesMap.get(mod.filePath)!.outDegree++;
        adj.get(mod.filePath)!.push(targetId);
      }
    }
  }

  // Rank core modules by in-degree
  const coreModules = [...nodesMap.values()]
    .sort((a, b) => b.inDegree - a.inDegree)
    .slice(0, 10)
    .filter(n => n.inDegree > 0)
    .map(n => n.id);

  // Count language distribution
  const tsFiles   = modules.filter(m => m.language === 'ts').length;
  const jsFiles   = modules.filter(m => m.language === 'js').length;
  const jsonFiles = modules.filter(m => m.language === 'json').length;

  const externalDeps = [...externalDepsSet].sort();

  return {
    nodes: [...nodesMap.values()],
    edges,
    coreModules,
    circularDeps: detectCycles(adj),
    stats: {
      totalFiles: modules.length,
      tsFiles,
      jsFiles,
      jsonFiles,
      totalEdges: edges.length,
      externalDeps,
    },
  };
}

/**
 * Convert graph to a compact text summary for the LLM prompt.
 */
export function graphToPromptContext(graph: DependencyGraph): string {
  const lines: string[] = [
    `## Dependency Graph Summary`,
    `- Total files: ${graph.stats.totalFiles} (TypeScript: ${graph.stats.tsFiles}, JavaScript: ${graph.stats.jsFiles}, JSON: ${graph.stats.jsonFiles})`,
    `- Internal edges: ${graph.stats.totalEdges}`,
    `- External packages: ${graph.stats.externalDeps.slice(0, 30).join(', ')}`,
    '',
    `## Core Modules (most imported)`,
    ...graph.coreModules.map(m => `- ${m}`),
    '',
  ];

  if (graph.circularDeps.length > 0) {
    lines.push('## Circular Dependencies Detected');
    graph.circularDeps.forEach(c => lines.push(`- ${c.join(' → ')}`));
    lines.push('');
  }

  lines.push('## Top-level File Edges (sample, max 40)');
  for (const edge of graph.edges.slice(0, 40)) {
    lines.push(`- ${edge.from} → ${edge.to}`);
  }

  return lines.join('\n');
}
