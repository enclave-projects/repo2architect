import { NextResponse } from 'next/server';
import { getAnalysisSnapshot } from '@/lib/store';
import { buildCombinedMarkdown } from '@/lib/markdown';

/**
 * GET /api/export/markdown
 *
 * Returns the full combined Markdown documentation for the last analyzed repo.
 * Responds with Content-Disposition: attachment so browsers trigger a download.
 */
export async function GET() {
  const snapshot = getAnalysisSnapshot();

  if (!snapshot) {
    return NextResponse.json(
      { error: 'No analysis available. Run /api/analyze first.' },
      { status: 404 }
    );
  }

  const markdown = buildCombinedMarkdown({
    repoUrl: snapshot.repoUrl,
    graph: snapshot.graph,
    geminiAnalysis: snapshot.geminiAnalysis,
    mermaidDiagram: snapshot.mermaidDiagram,
    generatedAt: snapshot.generatedAt,
  });

  const repoSlug = snapshot.repoUrl.split('/').slice(-2).join('-').replace(/[^a-zA-Z0-9-]/g, '-');
  const filename = `repo2architect-${repoSlug}.md`;

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
