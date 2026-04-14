export interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  relativeDate: string;
  author?: string;
}

export interface RepoInfo {
  name: string;
  branch: string;
  root: string;
}
