/**
 * Lightweight in-memory store for the most recent analysis result.
 *
 * This allows the three export API routes (markdown/diagram/json) to serve
 * the data from the last /api/analyze call without needing a database.
 *
 * NOTE: This is a single-process, in-memory cache only. In a multi-instance
 * deployment you would swap this for Redis / KV storage.
 */

import type { DependencyGraph } from './graph';
import type { GeminiAnalysis } from './gemini';

export interface AnalysisSnapshot {
  repoUrl: string;
  graph: DependencyGraph;
  geminiAnalysis: GeminiAnalysis;
  mermaidDiagram: string;
  generatedAt: Date;
}

let _snapshot: AnalysisSnapshot | null = null;

export function setAnalysisSnapshot(snapshot: AnalysisSnapshot): void {
  _snapshot = snapshot;
}

export function getAnalysisSnapshot(): AnalysisSnapshot | null {
  return _snapshot;
}
