import { execSync, type StdioOptions } from 'node:child_process';

const STDIO: StdioOptions = ['pipe', 'pipe', 'pipe'];

export function execWithStdin(cmd: string, input: string): string {
  return execSync(cmd, {
    encoding: 'utf-8',
    stdio: STDIO,
    input,
    maxBuffer: 50 * 1024 * 1024,
  });
}

export function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    encoding: 'utf-8',
    stdio: STDIO,
    ...(cwd ? { cwd } : {}),
  }).trim();
}

export function execLarge(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    encoding: 'utf-8',
    stdio: STDIO,
    maxBuffer: 50 * 1024 * 1024,
    ...(cwd ? { cwd } : {}),
  });
}

export function execLines(cmd: string): string[] {
  const output = exec(cmd);
  if (!output) {
    return [];
  }
  return output.split('\n');
}
