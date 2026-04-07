import { NextResponse } from 'next/server';
import { getAnalysisSnapshot } from '@/lib/store';
import { buildCombinedMarkdown, buildJsonExport } from '@/lib/markdown';
import { mermaidToMarkdownBlock } from '@/lib/mermaid';
import archiver from 'archiver';

/**
 * GET /api/export/zip
 *
 * Packages all analysis artifacts (markdown, diagram, json) into a single ZIP file.
 */
export async function GET() {
  const snapshot = getAnalysisSnapshot();

  if (!snapshot) {
    return NextResponse.json(
      { error: 'No analysis available. Run /api/analyze first.' },
      { status: 404 }
    );
  }

  const { repoUrl, geminiAnalysis, mermaidDiagram, generatedAt } = snapshot;

  const repoName = repoUrl.split('/').slice(-2).join('/');
  const repoSlug = repoName.replace(/[^a-zA-Z0-9-]/g, '-');

  // Prepare all the files we want in the ZIP
  const combinedMd = buildCombinedMarkdown(snapshot);
  const jsonExport = buildJsonExport(snapshot);

  const diagramMd = [
    `# Architecture Diagram: ${repoName}`,
    '',
    `> Source: ${repoUrl}`,
    `> Generated: ${generatedAt.toUTCString()}`,
    '',
    mermaidToMarkdownBlock(mermaidDiagram),
    '',
  ].join('\n');

  // Generate ZIP in-memory and return as a response
  return new Promise<NextResponse>((resolve) => {
    try {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks: Buffer[] = [];

      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => {
        const resultBuffer = Buffer.concat(chunks);
        const response = new NextResponse(resultBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="repo2architect-${repoSlug}.zip"`,
          },
        });
        resolve(response);
      });
      
      archive.on('error', (err) => {
        console.error('[export zip] Error generating zip:', err);
        resolve(NextResponse.json({ error: 'Failed to create zip file' }, { status: 500 }));
      });

      // Append files
      // PRD and Architecture plan directly from AI
      archive.append(geminiAnalysis.architectureAnalysis || '', { name: 'architecture_plan.md' });
      archive.append(geminiAnalysis.prdDraft || '', { name: 'prd_draft.md' });
      // Diagrams
      archive.append(mermaidDiagram, { name: 'dependency_graph.mmd' });
      archive.append(diagramMd, { name: 'dependency_diagram.md' });
      // Full report and raw data
      archive.append(combinedMd, { name: 'full_report.md' });
      archive.append(JSON.stringify(jsonExport, null, 2), { name: 'data.json' });

      archive.finalize();
    } catch (error) {
      console.error('[export zip] Exception:', error);
      resolve(NextResponse.json({ error: 'Failed to create zip file due to exception' }, { status: 500 }));
    }
  });
}
