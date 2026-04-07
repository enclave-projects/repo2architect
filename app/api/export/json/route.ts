import { NextResponse } from 'next/server';
import { getAnalysisSnapshot } from '@/lib/store';
import { buildJsonExport } from '@/lib/markdown';

/**
 * GET /api/export/json
 *
 * Returns the full structured JSON object for the last analyzed repo.
 * Includes all graph data, AI analysis, and the Mermaid diagram.
 */
export async function GET() {
  const snapshot = getAnalysisSnapshot();

  if (!snapshot) {
    return NextResponse.json(
      { error: 'No analysis available. Run /api/analyze first.' },
      { status: 404 }
    );
  }

  const exportData = buildJsonExport({
    repoUrl: snapshot.repoUrl,
    graph: snapshot.graph,
    geminiAnalysis: snapshot.geminiAnalysis,
    mermaidDiagram: snapshot.mermaidDiagram,
    generatedAt: snapshot.generatedAt,
  });

  const repoSlug = snapshot.repoUrl.split('/').slice(-2).join('-').replace(/[^a-zA-Z0-9-]/g, '-');
  const filename = `repo2architect-${repoSlug}.json`;

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
