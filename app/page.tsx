'use client';

import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import {
  Github, FolderTree, FileCode2, ArrowRight, Loader2,
  GitBranch, Cpu, Network, AlertTriangle, BookOpen,
  Layers, Package, RefreshCw, ChevronDown, ChevronUp,
  BarChart3, Braces, Sparkles, FileText,
  Download, Copy, Check, Terminal, FileJson2, Share2, Archive
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface GraphStats {
  totalFiles: number;
  tsFiles: number;
  jsFiles: number;
  jsonFiles: number;
  totalEdges: number;
  externalDeps: string[];
}

interface AnalysisResult {
  success: boolean;
  url: string;
  structure: any[];
  graph: {
    stats: GraphStats;
    coreModules: string[];
    circularDeps: string[][];
    nodes: { id: string; language: string; inDegree: number; outDegree: number; exports: string[] }[];
    edges: { from: string; to: string; specifier: string }[];
  };
  geminiAnalysis: {
    architectureAnalysis: string;
    prdDraft: string;
    model: string;
  };
  mermaidDiagram: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count?: string | number }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <h2 className="text-xl font-semibold flex items-center gap-2.5 text-white">
        <span className="text-indigo-400">{icon}</span>
        {label}
      </h2>
      {count !== undefined && (
        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          {count}
        </span>
      )}
      <div className="h-px flex-1 bg-gradient-to-r from-neutral-800 to-transparent" />
    </div>
  );
}

function StatCard({ label, value, sub, accent = 'indigo' }: { label: string; value: string | number; sub?: string; accent?: string }) {
  const colors: Record<string, string> = {
    indigo: 'border-indigo-500/20 bg-indigo-500/5',
    emerald: 'border-emerald-500/20 bg-emerald-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
    rose: 'border-rose-500/20 bg-rose-500/5',
  };
  return (
    <div className={`rounded-2xl border p-5 ${colors[accent]} flex flex-col gap-1`}>
      <span className="text-xs uppercase tracking-widest text-neutral-500 font-medium">{label}</span>
      <span className="text-3xl font-mono font-extralight text-white">{value}</span>
      {sub && <span className="text-xs text-neutral-500">{sub}</span>}
    </div>
  );
}

function MarkdownBlock({ content }: { content: string }) {
  // Convert markdown to readable display without a library - render headings, bullets, bold
  const lines = content.split('\n');
  return (
    <div className="text-sm text-neutral-300 leading-relaxed space-y-1.5 font-mono">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <p key={i} className="text-indigo-400 font-semibold text-base mt-4 mb-1 font-sans">{line.slice(3)}</p>;
        if (line.startsWith('### ')) return <p key={i} className="text-neutral-200 font-semibold mt-3 mb-0.5 font-sans">{line.slice(4)}</p>;
        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="text-white font-semibold font-sans">{line.slice(2, -2)}</p>;
        if (line.startsWith('- ')) return <p key={i} className="pl-4 text-neutral-400 before:content-['›'] before:mr-2 before:text-indigo-500">{line.slice(2)}</p>;
        if (line.startsWith('* ')) return <p key={i} className="pl-4 text-neutral-400 before:content-['›'] before:mr-2 before:text-indigo-500">{line.slice(2)}</p>;
        if (line.trim() === '') return <div key={i} className="h-2" />;
        // Handle inline bold
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        if (parts.length > 1) return (
          <p key={i}>{parts.map((p, j) => p.startsWith('**') ? <strong key={j} className="text-white font-sans">{p.slice(2, -2)}</strong> : p)}</p>
        );
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {label || (copied ? 'Copied!' : 'Copy')}
    </button>
  );
}

function DownloadButton({ text, filename, label }: { text: string; filename: string; label?: string }) {
  const handleDownload = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  return (
    <button onClick={handleDownload} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors">
      <Download className="w-3.5 h-3.5" />
      {label || 'Download'}
    </button>
  );
}

// ── Mermaid Diagram Component ─────────────────────────────────────────────────
function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: '#0a0a0a',
            primaryColor: '#4f46e5',
            primaryTextColor: '#e2e8f0',
            primaryBorderColor: '#6366f1',
            lineColor: '#4f4f6f',
            secondaryColor: '#1f1f2e',
            tertiaryColor: '#16162a',
            edgeLabelBackground: '#0a0a0a',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '12px',
          },
        });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Render error');
      }
    }
    render();
    return () => { cancelled = true; };
  }, [code]);

  if (error) return (
    <div className="p-4 text-xs text-amber-400 font-mono bg-amber-500/5 border border-amber-500/20 rounded-xl">
      ⚠ Diagram render error: {error}
      <pre className="mt-2 text-neutral-500 whitespace-pre-wrap">{code}</pre>
    </div>
  );

  if (!svg) return (
    <div className="flex items-center justify-center h-48 text-neutral-600">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Rendering diagram…
    </div>
  );

  return (
    <div
      ref={ref}
      className="overflow-auto max-h-[600px] p-4 rounded-xl bg-neutral-950"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg) }}
    />
  );
}

function Collapsible({ title, icon, children, defaultOpen = false }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-800/50 transition-colors"
      >
        <span className="flex items-center gap-2.5 text-sm font-medium text-neutral-200">
          <span className="text-neutral-500">{icon}</span>
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-neutral-600" /> : <ChevronDown className="w-4 h-4 text-neutral-600" />}
      </button>
      {open && <div className="border-t border-neutral-800">{children}</div>}
    </div>
  );
}

// ── Loading Steps ─────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Cloning repository…', icon: <GitBranch className="w-4 h-4" /> },
  { label: 'Scanning file tree…', icon: <FolderTree className="w-4 h-4" /> },
  { label: 'Parsing AST modules…', icon: <Braces className="w-4 h-4" /> },
  { label: 'Building dependency graph…', icon: <Network className="w-4 h-4" /> },
  { label: 'Running Gemini analysis…', icon: <Sparkles className="w-4 h-4" /> },
];

function LoadingSteps({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) { setStep(0); return; }
    const timings = [3000, 5000, 10000, 15000, 30000];
    let current = 0;
    let timer: ReturnType<typeof setTimeout>;
    const advance = () => {
      if (current < STEPS.length - 1) {
        current++;
        setStep(current);
        timer = setTimeout(advance, timings[current] ?? 8000);
      }
    };
    timer = setTimeout(advance, timings[0]);
    return () => clearTimeout(timer);
  }, [active]);

  if (!active) return null;
  return (
    <div className="mt-10 w-full max-w-lg mx-auto space-y-2">
      {STEPS.map((s, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-500 ${
            i < step ? 'opacity-40' : i === step ? 'bg-indigo-500/10 border border-indigo-500/20 opacity-100' : 'opacity-20'
          }`}
        >
          <span className={i === step ? 'text-indigo-400 animate-pulse' : 'text-neutral-600'}>{s.icon}</span>
          <span className={`text-sm ${i === step ? 'text-indigo-300' : 'text-neutral-500'}`}>{s.label}</span>
          {i < step && <span className="ml-auto text-emerald-500 text-xs">✓</span>}
          {i === step && <Loader2 className="ml-auto w-3.5 h-3.5 text-indigo-400 animate-spin" />}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'architecture' | 'prd'>('architecture');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const g = result?.graph;
  const ai = result?.geminiAnalysis;
  const mermaidDiagram = result?.mermaidDiagram ?? '';

  // Manual Setup Logic
  const nodeBuiltins = new Set(['fs', 'path', 'os', 'crypto', 'child_process', 'util', 'events', 'http', 'https', 'stream', 'url', 'assert', 'buffer', 'net', 'tls', 'querystring', 'zlib']);
  const runtimeDeps = g?.stats.externalDeps.filter(d => !nodeBuiltins.has(d) && !d.startsWith('@types/')) || [];
  const installCmd = runtimeDeps.length > 0 ? `npm install ${runtimeDeps.join(' ')}` : 'npm install';

  // AI Context Prompts
  const repoName = result?.url.split('/').pop() || 'repository';
  const claudePrompt = g ? `You are an expert software engineer. We are working on the ${repoName} repository (${result?.url}). This is a ${g.stats.tsFiles > g.stats.jsFiles ? 'TypeScript' : 'JavaScript'} project with a total of ${g.stats.totalFiles} files. The core architectural modules are ${g.coreModules.slice(0, 3).join(', ')}. Please act as my pair programmer for this codebase. When suggesting changes, ensure you adhere to the existing module boundaries.` : '';
  const antigravityPrompt = g ? `You are Antigravity, my powerful agentic AI coding assistant. We are maintaining ${result?.url}. The project relies heavily on the following external dependencies: ${runtimeDeps.slice(0, 8).join(', ')}. Review the current codebase state, paying close attention to the dependency graph and any circular dependencies. I will rely on you to make direct edits and run terminal commands to test our changes.` : '';
  const geminiPrompt = `You are a senior software architect. I am providing you with the context of the ${repoName} repository. Our goal is to expand its capabilities while maintaining its original Product Requirements. Treat the existing code as the baseline, and use your advanced reasoning to help me implement new features securely and efficiently. If you see any architectural anti-patterns, call them out immediately.`;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 selection:bg-indigo-500/30">
      {/* Grid BG */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#4f4f4f18_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f18_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_60%,transparent_100%)] pointer-events-none" />

      <main className="relative max-w-5xl mx-auto px-4 sm:px-6 pb-24 pt-20 flex flex-col items-center">

        {/* ── Hero ── */}
        <div className="text-center space-y-5 mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-medium border border-indigo-500/20 tracking-wider uppercase">
            <Cpu className="w-3.5 h-3.5" />
            Repo2Architect Engine
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-neutral-500">
            Audit Any Codebase.<br className="hidden md:block" />
            <span className="italic font-serif"> Automatically.</span>
          </h1>
          <p className="text-base text-neutral-400 max-w-xl mx-auto">
            Clone → Parse → Graph → AI. Generate architecture plans and PRD drafts from any public GitHub repository in seconds.
          </p>
        </div>

        {/* ── Input ── */}
        <div className="w-full max-w-2xl bg-neutral-900/60 backdrop-blur-xl border border-neutral-800 rounded-3xl p-2 shadow-2xl">
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <div className="absolute left-5 text-neutral-600 pointer-events-none">
              <Github className="w-5 h-5" />
            </div>
            <input
              type="url"
              placeholder="https://github.com/username/repository"
              className="w-full bg-transparent border-none py-4 pl-14 pr-32 text-base text-white placeholder-neutral-600 focus:outline-none rounded-2xl"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !url}
              className="absolute right-2 top-1.5 bottom-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-5 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 group"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span className="hidden sm:inline">Analyzing</span></>
              ) : (
                <><span className="hidden sm:inline">Analyze</span><ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></>
              )}
            </button>
          </form>
        </div>

        {/* ── Loading Steps ── */}
        {isLoading && <LoadingSteps active={isLoading} />}

        {/* ── Error ── */}
        {error && (
          <div className="mt-8 px-5 py-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl max-w-2xl w-full text-sm text-center">
            <AlertTriangle className="w-4 h-4 inline-block mr-2" />{error}
          </div>
        )}

        {/* ── Results ── */}
        {result && g && ai && (
          <div className="mt-16 w-full space-y-10">

            {/* ── 0. Quick Setup ── */}
            <div className="bg-gradient-to-r from-indigo-500/10 to-transparent border border-indigo-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-indigo-400" />
                  Quick Manual Setup
                </h3>
                <p className="text-sm text-neutral-400">Run this command to install the extracted runtime dependencies manually.</p>
              </div>
              <div className="flex bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shrink-0">
                <div className="px-4 py-3 font-mono text-xs text-neutral-300 max-w-sm overflow-x-auto whitespace-nowrap">
                  {installCmd}
                </div>
                <div className="border-l border-neutral-800 p-1.5 bg-neutral-900 flex items-center">
                  <CopyButton text={installCmd} label="Copy" />
                </div>
              </div>
            </div>

            {/* ── 1. Graph Stats ── */}
            <section>
              <SectionHeader icon={<BarChart3 className="w-5 h-5" />} label="Repository Overview" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Files" value={g.stats.totalFiles} accent="indigo" />
                <StatCard label="TypeScript" value={g.stats.tsFiles} sub="source files" accent="indigo" />
                <StatCard label="JavaScript" value={g.stats.jsFiles} sub="source files" accent="emerald" />
                <StatCard label="Dep Edges" value={g.stats.totalEdges} sub="internal links" accent="amber" />
              </div>
            </section>

            {/* ── 2. Core Modules & Circulars ── */}
            <section>
              <SectionHeader icon={<Network className="w-5 h-5" />} label="Dependency Graph" count={`${g.stats.totalEdges} edges`} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4 text-emerald-400">
                    <Layers className="w-4 h-4" />
                    <span className="text-sm font-medium text-white">Core Modules</span>
                    <span className="text-xs text-neutral-500 ml-1">(highest in-degree)</span>
                  </div>
                  <ul className="space-y-1.5">
                    {g.coreModules.length > 0 ? g.coreModules.map((m, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs font-mono text-neutral-400">
                        <span className="text-indigo-500 w-4 text-right shrink-0">{i + 1}.</span>
                        <span className="truncate">{m}</span>
                      </li>
                    )) : <li className="text-xs text-neutral-600">No highly-imported modules detected</li>}
                  </ul>
                </div>

                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4 text-amber-400">
                    <RefreshCw className="w-4 h-4" />
                    <span className="text-sm font-medium text-white">Circular Dependencies</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 ${g.circularDeps.length > 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                      {g.circularDeps.length} found
                    </span>
                  </div>
                  {g.circularDeps.length === 0 ? (
                    <p className="text-xs text-emerald-400">✓ No circular dependencies detected</p>
                  ) : (
                    <ul className="space-y-2">
                      {g.circularDeps.slice(0, 5).map((chain, i) => (
                        <li key={i} className="text-xs font-mono text-amber-400/80 bg-amber-500/5 rounded-lg px-3 py-2 border border-amber-500/10">
                          {chain.join(' → ')}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-4 pt-4 border-t border-neutral-800">
                    <p className="text-xs text-neutral-600 mb-2 uppercase tracking-wider">External packages ({g.stats.externalDeps.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.stats.externalDeps.slice(0, 12).map(dep => (
                        <span key={dep} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                          {dep}
                        </span>
                      ))}
                      {g.stats.externalDeps.length > 12 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-600">
                          +{g.stats.externalDeps.length - 12} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── 3. AI Analysis ── */}
            <section>
              <SectionHeader icon={<Sparkles className="w-5 h-5" />} label="AI Analysis" count={ai.model} />

              {/* Tabs */}
              <div className="flex gap-1 mb-4 bg-neutral-900 border border-neutral-800 rounded-xl p-1 w-fit">
                {(['architecture', 'prd'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeTab === tab
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {tab === 'architecture' ? <><BookOpen className="w-3.5 h-3.5" />Architecture</> : <><FileText className="w-3.5 h-3.5" />PRD Draft</>}
                  </button>
                ))}
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                <div className="bg-neutral-950/60 px-5 py-3 border-b border-neutral-800 flex items-center flex-wrap gap-4 justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-500 uppercase tracking-wider">
                      {activeTab === 'architecture' ? 'Architecture Inference' : 'Product Requirements Draft'}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-700 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">{ai.model}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CopyButton text={activeTab === 'architecture' ? ai.architectureAnalysis : ai.prdDraft} label="Copy to Clipboard" />
                    <DownloadButton 
                      text={activeTab === 'architecture' ? ai.architectureAnalysis : ai.prdDraft} 
                      filename={activeTab === 'architecture' ? 'Architecture_Plan.txt' : 'PRD_Draft.txt'} 
                      label="Download as .txt"
                    />
                  </div>
                </div>
                <div className="p-6 max-h-[600px] overflow-y-auto">
                  <MarkdownBlock content={activeTab === 'architecture' ? ai.architectureAnalysis : ai.prdDraft} />
                </div>
              </div>
            </section>

            {/* ── 3.5. AI Context Prompts ── */}
            <section>
              <SectionHeader icon={<Cpu className="w-5 h-5" />} label="AI-Ready Context Prompts" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[
                  { name: 'Claude Code (CLI)', text: claudePrompt },
                  { name: 'Google Antigravity', text: antigravityPrompt },
                  { name: 'Gemini CLI', text: geminiPrompt },
                ].map((prompt, idx) => (
                  <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col">
                    <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-300">{prompt.name}</span>
                      <CopyButton text={prompt.text} />
                    </div>
                    <div className="p-4 bg-black/40 rounded-b-2xl grow">
                      <p className="text-xs font-mono text-neutral-400 break-words leading-relaxed whitespace-pre-wrap">{prompt.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── 4. Architecture Diagram (Phase 3) ── */}
            <section>
              <SectionHeader icon={<Network className="w-5 h-5" />} label="Architecture Diagram" count="Mermaid" />
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                <div className="bg-neutral-950/60 px-5 py-3 border-b border-neutral-800 flex items-center justify-between flex-wrap gap-3">
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">Dependency Graph · Top 40 nodes · Core modules highlighted</span>
                  <div className="flex items-center gap-2">
                    <CopyButton text={mermaidDiagram} label="Copy Mermaid" />
                    <DownloadButton text={mermaidDiagram} filename="diagram.mmd" label="Download .mmd" />
                  </div>
                </div>
                <div className="p-4">
                  {mermaidDiagram ? <MermaidDiagram code={mermaidDiagram} /> : (
                    <p className="text-xs text-neutral-600 text-center py-8">No diagram available for this repository.</p>
                  )}
                </div>
              </div>
            </section>

            {/* ── 5. Export Hub (Phase 3 & 4) ── */}
            <section>
              <SectionHeader icon={<Share2 className="w-5 h-5" />} label="Export Hub" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    icon: <Archive className="w-5 h-5" />,
                    label: 'Download All (.zip)',
                    desc: 'Package everything – PRD, Architecture Plan, Graph, and Raw JSON – into a single zip file.',
                    href: '/api/export/zip',
                    buttonLabel: 'Download .zip',
                    accent: 'amber',
                  },
                  {
                    icon: <FileText className="w-5 h-5" />,
                    label: 'Full Documentation',
                    desc: 'Complete report — stats, AI analysis, diagram, all modules — as a single formatted Markdown file.',
                    href: '/api/export/markdown',
                    buttonLabel: 'Download .md',
                    accent: 'indigo',
                  },
                  {
                    icon: <Network className="w-5 h-5" />,
                    label: 'Architecture Diagram',
                    desc: 'Standalone Mermaid dependency graph. Paste into any Markdown viewer, Notion, or GitHub README.',
                    href: '/api/export/diagram',
                    buttonLabel: 'Download Diagram',
                    accent: 'violet',
                  },
                  {
                    icon: <FileJson2 className="w-5 h-5" />,
                    label: 'Structured JSON',
                    desc: 'Full structured export — all graph nodes/edges, AI outputs, and metadata in machine-readable JSON.',
                    href: '/api/export/json',
                    buttonLabel: 'Download .json',
                    accent: 'emerald',
                  },
                ].map((item, idx) => (
                  <div key={idx} className={`bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col gap-4 hover:border-neutral-700 transition-colors`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      item.accent === 'indigo' ? 'bg-indigo-500/10 text-indigo-400' :
                      item.accent === 'violet' ? 'bg-violet-500/10 text-violet-400' :
                      item.accent === 'amber' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {item.icon}
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-white">{item.label}</h3>
                      <p className="text-[11px] text-neutral-500 leading-relaxed">{item.desc}</p>
                    </div>
                    <a
                      href={item.href}
                      download
                      className={`mt-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        item.accent === 'indigo'
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                          : item.accent === 'violet'
                          ? 'bg-violet-600 hover:bg-violet-500 text-white'
                          : item.accent === 'amber'
                          ? 'bg-amber-600 hover:bg-amber-500 text-white'
                          : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                      }`}
                    >
                      <Download className="w-4 h-4" />
                      {item.buttonLabel}
                    </a>
                  </div>
                ))}
              </div>
            </section>

            {/* ── 6. Raw Data ── */}
            <section className="space-y-3">
              <SectionHeader icon={<Package className="w-5 h-5" />} label="Raw Data" />

              <Collapsible title={`Module Nodes (${g.nodes.length})`} icon={<Braces className="w-4 h-4" />}>
                <div className="p-4 overflow-auto max-h-72">
                  <table className="w-full text-xs font-mono text-neutral-400">
                    <thead>
                      <tr className="text-neutral-600 border-b border-neutral-800">
                        <th className="text-left pb-2 pr-4">Module</th>
                        <th className="text-left pb-2 pr-4">Lang</th>
                        <th className="text-left pb-2 pr-4">In ↑</th>
                        <th className="text-left pb-2">Out ↓</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.nodes.slice(0, 50).map((n, i) => (
                        <tr key={i} className="border-b border-neutral-800/50 hover:bg-neutral-800/20">
                          <td className="py-1.5 pr-4 text-neutral-300 truncate max-w-[260px]">{n.id}</td>
                          <td className="py-1.5 pr-4 text-indigo-500">{n.language}</td>
                          <td className="py-1.5 pr-4 text-emerald-500">{n.inDegree}</td>
                          <td className="py-1.5 text-amber-500">{n.outDegree}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Collapsible>

              <Collapsible title={`File Tree (${result.structure?.length ?? 0} root entries)`} icon={<FileCode2 className="w-4 h-4" />}>
                <div className="p-4 overflow-auto max-h-64">
                  <pre className="text-[11px] font-mono text-neutral-500 leading-relaxed">
                    {JSON.stringify(result.structure?.slice(0, 20), null, 2)}
                  </pre>
                </div>
              </Collapsible>
            </section>

          </div>
        )}
      </main>
    </div>
  );
}
