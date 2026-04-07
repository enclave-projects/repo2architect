import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';


/**
 * Validates a GitHub URL
 */
export function isValidGithubUrl(url: string): boolean {
  const githubUrlRegex = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/i;
  return githubUrlRegex.test(url);
}

/**
 * Clones a public repository to a temporary server location.
 * @param url The GitHub URL to clone
 * @returns The temporary path where the repo was cloned
 */
export async function cloneRepository(url: string): Promise<string> {
  if (!isValidGithubUrl(url)) {
    throw new Error('Invalid GitHub URL');
  }

  // Create a unique temporary directory
  const uniqueId = Math.random().toString(36).substring(2, 15);
  const tempDir = path.join(os.tmpdir(), `repo2architect-${uniqueId}`);

  // Create the directory just in case it takes time but git clone will create it if we provide target
  await fs.mkdir(tempDir, { recursive: true });

  // Use shallow clone for speed since we only need the latest code
  return new Promise<string>((resolve, reject) => {
    const gitProcess = spawn('git', ['clone', '--depth', '1', url, tempDir]);

    gitProcess.on('close', async (code) => {
      if (code === 0) {
        resolve(tempDir);
      } else {
        // Cleanup if clone fails
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        reject(new Error(`Failed to clone repository: git exited with code ${code}`));
      }
    });

    gitProcess.on('error', async (error) => {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      reject(new Error(`Failed to start git clone process: ${error.message}`));
    });
  });
}

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
}

/**
 * Scans a directory and returns its structure
 * @param dirPath The root directory to scan
 * @param rootPath Internal parameter to track relative paths
 */
export async function scanDirectory(dirPath: string, rootPath = dirPath): Promise<FileNode[]> {
  const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', '.next', 'build']);
  
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result: FileNode[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');
    
    const node: FileNode = {
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: relativePath,
    };

    if (entry.isDirectory()) {
      node.children = await scanDirectory(fullPath, rootPath);
    }

    result.push(node);
  }

  return result.sort((a, b) => {
    // Directories first
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
