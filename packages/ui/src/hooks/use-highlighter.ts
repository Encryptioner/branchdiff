import { useState, useEffect, useCallback, useRef } from 'react';
import type { Highlighter, BundledLanguage } from 'shiki';

const LANG_MAP: Record<string, BundledLanguage> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  html: 'html',
  md: 'markdown',
  mdx: 'mdx',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  ps1: 'powershell',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  svg: 'xml',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  toml: 'toml',
  ini: 'ini',
  lua: 'lua',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  vue: 'vue',
  svelte: 'svelte',
  php: 'php',
  r: 'r',
  scss: 'scss',
  less: 'less',
  sass: 'sass',
  styl: 'stylus',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  clj: 'clojure',
  cljs: 'clojure',
  pl: 'perl',
  pm: 'perl',
  zig: 'zig',
  nim: 'nim',
  ml: 'ocaml',
  mli: 'ocaml',
  fs: 'fsharp',
  fsx: 'fsharp',
  groovy: 'groovy',
  gradle: 'groovy',
  tf: 'hcl',
  hcl: 'hcl',
  proto: 'protobuf',
  prisma: 'prisma',
  astro: 'astro',
  m: 'objective-c',
  mm: 'objective-cpp',
  tex: 'latex',
  latex: 'latex',
  diff: 'diff',
  patch: 'diff',
  nginx: 'nginx',
  conf: 'ini',
  cfg: 'ini',
  env: 'dotenv',
  bat: 'bat',
  cmd: 'bat',
  asm: 'asm',
  s: 'asm',
  jsonc: 'jsonc',
  json5: 'json5',
  csv: 'csv',
  tsv: 'csv',
  wasm: 'wasm',
  ejs: 'html',
  hbs: 'handlebars',
  pug: 'pug',
  jade: 'pug',
  rst: 'rst',
  jl: 'julia',
  v: 'v',
  sol: 'solidity',
  luau: 'luau',
  glsl: 'glsl',
  hlsl: 'hlsl',
  wgsl: 'wgsl',
};

const FILENAME_MAP: Record<string, BundledLanguage> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  cmakelists: 'cmake',
  gemfile: 'ruby',
  rakefile: 'ruby',
  justfile: 'just',
  vagrantfile: 'ruby',
};

function getLang(filePath: string): BundledLanguage | null {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';

  const fileNameMatch = FILENAME_MAP[fileName];
  if (fileNameMatch) {
    return fileNameMatch;
  }

  return LANG_MAP[ext] || null;
}

// Shiki core (~200KB) is dynamic-imported on first use. Language grammars are
// loaded on demand via `highlighter.loadLanguage(lang)` — so a Python repo never
// pays for the TypeScript grammar, etc.
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(shiki =>
      shiki.createHighlighter({
        themes: ['github-light', 'github-dark'],
        langs: [], // loaded lazily per file
      })
    );
  }
  return highlighterPromise;
}

export interface HighlightedTokens {
  tokens: { text: string; color?: string }[];
}

export function useHighlighter() {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);
  const [loadedLangs, setLoadedLangs] = useState<Set<BundledLanguage>>(() => new Set());
  const pendingLangsRef = useRef<Set<BundledLanguage>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getHighlighter().then(h => {
      if (!cancelled) setHighlighter(h);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const highlight = useCallback((code: string, filePath: string, theme: 'light' | 'dark'): HighlightedTokens[] | null => {
    if (!highlighter) {
      return null;
    }

    const lang = getLang(filePath);
    if (!lang) {
      return null;
    }

    if (!loadedLangs.has(lang)) {
      // Lang not yet loaded — kick off async load, return null for now.
      // Caller will re-render when `loadedLangs` updates.
      if (!pendingLangsRef.current.has(lang)) {
        pendingLangsRef.current.add(lang);
        highlighter
          .loadLanguage(lang)
          .then(() => {
            setLoadedLangs(prev => {
              if (prev.has(lang)) return prev;
              const next = new Set(prev);
              next.add(lang);
              return next;
            });
          })
          .catch(() => {
            // Grammar failed — mark as attempted so we don't retry forever
            pendingLangsRef.current.delete(lang);
          });
      }
      return null;
    }

    const shikiTheme = theme === 'dark' ? 'github-dark' : 'github-light';

    try {
      const result = highlighter.codeToTokens(code, {
        lang,
        theme: shikiTheme,
      });

      return result.tokens.map(line => ({
        tokens: line.map(token => ({
          text: token.content,
          color: token.color,
        })),
      }));
    } catch {
      return null;
    }
  }, [highlighter, loadedLangs]);

  return { highlight, ready: highlighter !== null };
}
