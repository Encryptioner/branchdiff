import { exec } from './exec.js';

const PR_URL_REGEX = /(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

export function isGitHubPrUrl(value: string): boolean {
  return PR_URL_REGEX.test(value);
}

export function parseGitHubPrUrl(url: string): { owner: string; repo: string; number: number } | null {
  const match = url.match(PR_URL_REGEX);
  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ''),
    number: parseInt(match[3], 10),
  };
}

export function checkoutPr(prNumber: number): void {
  exec(`gh pr checkout ${prNumber}`);
}

export function getPrBaseRef(prNumber: number): string {
  return exec(`gh pr view ${prNumber} --json baseRefName --jq '.baseRefName'`);
}
