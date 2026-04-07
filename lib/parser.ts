import { promises as fs } from 'fs';
import path from 'path';
import { parse as parseTs } from '@typescript-eslint/typescript-estree';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedModule {
  filePath: string;       // relative path from repo root
  imports: string[];      // raw specifiers this file imports
  exports: string[];      // exported names / "default"
  language: 'ts' | 'js' | 'json' | 'other';
}

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);
const CODE_EXTS   = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', '.next', 'build', '__pycache__', '.cache'
]);

// ── Directory walker ──────────────────────────────────────────────────────────

async function* walkFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      yield* walkFiles(path.join(dir, entry.name));
    } else if (SOURCE_EXTS.has(path.extname(entry.name))) {
      yield path.join(dir, entry.name);
    }
  }
}

// ── JSON config parser ────────────────────────────────────────────────────────

function parseJsonConfig(filePath: string, content: string): ParsedModule {
  const deps: string[] = [];
  try {
    const json = JSON.parse(content);
    if (json.dependencies)    deps.push(...Object.keys(json.dependencies));
    if (json.devDependencies) deps.push(...Object.keys(json.devDependencies));
    if (json.peerDependencies) deps.push(...Object.keys(json.peerDependencies));
  } catch { /* malformed JSON – skip */ }
  return { filePath, imports: deps, exports: [], language: 'json' };
}

// ── AST-based TS/JS parser ────────────────────────────────────────────────────

function extractFromAst(filePath: string, code: string): ParsedModule {
  const imports: string[] = [];
  const exports: string[] = [];

  let ast: ReturnType<typeof parseTs> | null = null;
  try {
    ast = parseTs(code, {
      jsx: filePath.endsWith('.tsx') || filePath.endsWith('.jsx'),
      errorOnUnknownASTType: false,
      range: false,
      loc: false,
    });
  } catch {
    // TypeScript parse error – fall back to regex extraction
    return extractByRegex(filePath, code);
  }

  for (const node of ast.body) {
    switch (node.type) {
      // import "foo" & import x from "foo"
      case 'ImportDeclaration':
        if (typeof node.source.value === 'string') {
          imports.push(node.source.value);
        }
        break;

      // export default …
      case 'ExportDefaultDeclaration':
        exports.push('default');
        break;

      // export { x, y } / export const z = …
      case 'ExportNamedDeclaration': {
        if (node.source && typeof (node.source as any).value === 'string') {
          imports.push((node.source as any).value); // re-export counts as import
        }
        for (const spec of (node as any).specifiers ?? []) {
          exports.push((spec.exported?.name ?? spec.local?.name) || 'unknown');
        }
        const decl = (node as any).declaration;
        if (decl) {
          if (decl.id?.name)  exports.push(decl.id.name);
          for (const d of decl.declarations ?? []) {
            if (d.id?.name) exports.push(d.id.name);
          }
        }
        break;
      }

      // require("foo")  – CommonJS
      case 'ExpressionStatement':
      case 'VariableDeclaration': {
        extractRequires(node, imports);
        break;
      }
    }
  }

  return {
    filePath,
    imports: [...new Set(imports)],
    exports: [...new Set(exports)],
    language: (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) ? 'ts' : 'js',
  };
}

/** Pull require() calls from a node recursively */
function extractRequires(node: any, out: string[]) {
  if (!node || typeof node !== 'object') return;
  if (
    node.type === 'CallExpression' &&
    node.callee?.name === 'require' &&
    node.arguments?.[0]?.type === 'Literal'
  ) {
    out.push(node.arguments[0].value);
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') extractRequires(v, out);
  }
}

/** Regex fallback for files that can't be AST-parsed */
function extractByRegex(filePath: string, code: string): ParsedModule {
  const imports: string[] = [];
  const exports: string[] = [];
  const importRe = /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g;
  const exportRe = /export\s+(?:default|const|function|class|let|var)\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(code)) !== null) imports.push(m[1]);
  while ((m = exportRe.exec(code)) !== null)  exports.push(m[1]);
  return { filePath, imports: [...new Set(imports)], exports: [...new Set(exports)], language: 'other' };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse every source file in a cloned repo and return an array of ParsedModules.
 * Max file size 256 KB – silently skip larger files.
 */
export async function parseRepository(rootDir: string): Promise<ParsedModule[]> {
  const MAX_BYTES = 256 * 1024;
  const modules: ParsedModule[] = [];

  for await (const absPath of walkFiles(rootDir)) {
    try {
      const stat = await fs.stat(absPath);
      if (stat.size > MAX_BYTES) continue;

      const relPath = path.relative(rootDir, absPath).replace(/\\/g, '/');
      const ext = path.extname(absPath);
      const content = await fs.readFile(absPath, 'utf-8');

      if (ext === '.json') {
        modules.push(parseJsonConfig(relPath, content));
      } else if (CODE_EXTS.has(ext)) {
        const parsed = await new Promise<ParsedModule>((resolve) => {
          setImmediate(() => {
            resolve(extractFromAst(relPath, content));
          });
        });
        modules.push(parsed);
      }
    } catch {
      /* permission / binary file errors – skip silently */
    }
  }

  return modules;
}
