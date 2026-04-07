import type { DependencyGraph } from './graph';

/**
 * Sanitise a node id so it's a valid Mermaid node name.
 * Replaces characters that would break Mermaid syntax.
 */
function sanitiseId(id: string): string {
  // Replace non-alphanumeric chars (except underscores) with underscores
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Produce a display-friendly short label (just the basename, max 30 chars).
 */
function shortLabel(id: string): string {
  const parts = id.split('/');
  const base = parts[parts.length - 1] ?? id;
  return base.length > 30 ? base.slice(0, 27) + '...' : base;
}

/**
 * Convert the in-memory DependencyGraph to a Mermaid "graph TD" string.
 *
 * Strategy:
 *  - Only include nodes that participate in at least one internal edge
 *    (or are core modules) to keep the diagram readable.
 *  - Cap at MAX_NODES nodes and MAX_EDGES edges to avoid Mermaid timeouts.
 *  - Highlight core modules with a distinct style.
 */
export function graphToMermaid(graph: DependencyGraph): string {
  const MAX_NODES = 40;
  const MAX_EDGES = 60;

  // Determine which node ids to include
  const coreSet = new Set(graph.coreModules.slice(0, 10));

  // Collect candidate nodes by participation in edges
  const participantIds = new Set<string>();
  for (const e of graph.edges) {
    participantIds.add(e.from);
    participantIds.add(e.to);
  }

  // Prioritise core modules, then sort by in-degree desc, cap total
  const sortedNodes = graph.nodes
    .filter(n => participantIds.has(n.id) || coreSet.has(n.id))
    .sort((a, b) => {
      if (coreSet.has(a.id) && !coreSet.has(b.id)) return -1;
      if (!coreSet.has(a.id) && coreSet.has(b.id)) return 1;
      return b.inDegree - a.inDegree;
    })
    .slice(0, MAX_NODES);

  const includedIds = new Set(sortedNodes.map(n => n.id));

  // Only include edges where BOTH endpoints are in the included set
  const includedEdges = graph.edges
    .filter(e => includedIds.has(e.from) && includedIds.has(e.to))
    .slice(0, MAX_EDGES);

  // Build Mermaid lines
  const lines: string[] = ['graph TD'];

  // Node definitions with labels
  for (const node of sortedNodes) {
    const nodeId = sanitiseId(node.id);
    const label = shortLabel(node.id);
    lines.push(`  ${nodeId}["${label}"]`);
  }

  lines.push('');

  // Edge definitions
  const edgeSet = new Set<string>(); // dedup
  for (const edge of includedEdges) {
    const fromId = sanitiseId(edge.from);
    const toId = sanitiseId(edge.to);
    const key = `${fromId}-->${toId}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    lines.push(`  ${fromId} --> ${toId}`);
  }

  lines.push('');

  // Style core modules distinctly
  const coreNodeIds = sortedNodes
    .filter(n => coreSet.has(n.id))
    .map(n => sanitiseId(n.id));

  if (coreNodeIds.length > 0) {
    lines.push(`  classDef core fill:#4f46e5,stroke:#6366f1,color:#fff,font-weight:bold`);
    lines.push(`  class ${coreNodeIds.join(',')} core`);
  }

  return lines.join('\n');
}

/**
 * Wrap a raw Mermaid string in a fenced code block
 * (for inclusion in Markdown documents).
 */
export function mermaidToMarkdownBlock(mermaidCode: string): string {
  return '```mermaid\n' + mermaidCode + '\n```';
}
