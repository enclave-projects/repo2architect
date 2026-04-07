import { NextResponse } from 'next/server';
import { getAnalysisSnapshot } from '@/lib/store';
import { mermaidToMarkdownBlock } from '@/lib/mermaid';

/**
 * GET /api/export/diagram
 *
 * Returns the architecture diagram as a standalone Mermaid code block
 * wrapped in a minimal Markdown document, or as raw Mermaid text when
 * ?format=raw is passed as a query param.
 */
export async function GET(req: Request) {
  const snapshot = getAnalysisSnapshot();

  if (!snapshot) {
    return NextResponse.json(
      { error: 'No analysis available. Run /api/analyze first.' },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format'); // 'raw' | null

  if (format === 'raw') {
    // Return just the Mermaid code for embedding in tools
    return new NextResponse(snapshot.mermaidDiagram, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'inline; filename="diagram.mmd"',
      },
    });
  }

  // Default: return a Markdown file containing the fenced code block
  const repoSlug = snapshot.repoUrl.split('/').slice(-2).join('-').replace(/[^a-zA-Z0-9-]/g, '-');
  const repoName = snapshot.repoUrl.split('/').slice(-2).join('/');

  const content = [
    `# Architecture Diagram: ${repoName}`,
    '',
    `> Source: ${snapshot.repoUrl}`,
    `> Generated: ${snapshot.generatedAt.toUTCString()}`,
    '',
    '## Dependency Graph',
    '',
    '> Core modules (most imported) are highlighted in indigo. Diagram shows top 40 nodes by import frequency.',
    '',
    mermaidToMarkdownBlock(snapshot.mermaidDiagram),
    '',
  ].join('\n');

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="diagram-${repoSlug}.md"`,
    },
  });
}
