import { NextRequest, NextResponse } from 'next/server';
import { cloneRepository, scanDirectory, isValidGithubUrl } from '@/lib/git';
import { parseRepository } from '@/lib/parser';
import { buildGraph } from '@/lib/graph';
import { analyzeWithGemini } from '@/lib/gemini';
import { graphToMermaid } from '@/lib/mermaid';
import { setAnalysisSnapshot } from '@/lib/store';
import { promises as fs } from 'fs';

export async function POST(req: NextRequest) {
  let tempDir: string | undefined;

  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'GitHub URL is required' }, { status: 400 });
    }

    if (!isValidGithubUrl(url)) {
      return NextResponse.json(
        { error: 'Invalid GitHub public repository URL format' },
        { status: 400 }
      );
    }

    // Wrap analysis in a 60-second timeout using Promise.race and AbortController pattern.
    const analysisTask = async () => {
      // ── Phase 1: Clone & Scan ─────────────────────────────────────────────────
      console.log(`[analyze] Cloning: ${url}`);
      tempDir = await cloneRepository(url);

      console.log(`[analyze] Scanning directory tree`);
      const structure = await scanDirectory(tempDir);

      const countFiles = (nodes: any[]): number => {
        let count = 0;
        for (const n of nodes) {
          if (n.type === 'file') count++;
          else if (n.children) count += countFiles(n.children);
        }
        return count;
      };

      if (countFiles(structure) > 10000) {
        throw new Error('TOO_LARGE');
      }

      // ── Phase 2: AST Parsing ────────────────────────────────────────────────
      console.log(`[analyze] Parsing source files for AST`);
      const modules = await parseRepository(tempDir);

      // ── Phase 2: Graph Construction ─────────────────────────────────────────
      console.log(`[analyze] Building dependency graph (${modules.length} modules)`);
      const graph = buildGraph(modules);

      // ── Phase 2: Gemini Analysis ────────────────────────────────────────────
      console.log(`[analyze] Running Gemini analysis`);
      const geminiAnalysis = await analyzeWithGemini(graph, url);

      // ── Phase 3: Mermaid Diagram ────────────────────────────────────────────
      console.log(`[analyze] Generating Mermaid diagram`);
      const mermaidDiagram = graphToMermaid(graph);

      // ── Phase 3: Save snapshot for export routes ────────────────────────────
      setAnalysisSnapshot({
        repoUrl: url,
        graph,
        geminiAnalysis,
        mermaidDiagram,
        generatedAt: new Date(),
      });

      return { structure, graph, geminiAnalysis, mermaidDiagram };
    };

    const timeoutTask = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), 60000);
    });

    const result = await Promise.race([analysisTask(), timeoutTask]);

    return NextResponse.json({
      success: true,
      url,
      // Phase 1 outputs
      structure: result.structure,
      // Phase 2 outputs
      graph: {
        stats: result.graph.stats,
        coreModules: result.graph.coreModules,
        circularDeps: result.graph.circularDeps,
        // Send only first 200 nodes/edges to keep payload manageable
        nodes: result.graph.nodes.slice(0, 200).map(n => ({
          id: n.id,
          language: n.language,
          inDegree: n.inDegree,
          outDegree: n.outDegree,
          exports: n.exports.slice(0, 10),
        })),
        edges: result.graph.edges.slice(0, 200),
      },
      geminiAnalysis: result.geminiAnalysis,
      // Phase 3 outputs
      mermaidDiagram: result.mermaidDiagram,
    });
  } catch (error) {
    console.error('[analyze] Error:', error);
    if (error instanceof Error && error.message === 'TOO_LARGE') {
      return NextResponse.json({ error: 'Repository too large to analyze (Max 10,000 files).' }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'TIMEOUT') {
      return NextResponse.json({ error: 'Gateway Timeout: Analysis took more than 60 seconds.' }, { status: 504 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred during analysis' },
      { status: 500 }
    );
  } finally {
    // Always clean up the temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      console.log(`[analyze] Cleaned up: ${tempDir}`);
    }
  }
}
