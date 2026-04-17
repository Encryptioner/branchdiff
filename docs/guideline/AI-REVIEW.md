# AI-Assisted Review with branchdiff

branchdiff exposes its review state as structured data (JSON + markdown) and has CLI commands designed for agents. Any AI assistant — Claude Code, Cursor, Codex, Copilot, Gemini CLI — can use it with no special plugin or skills package.

This guide shows four workflows and the prompt snippets that make them work:

1. **AI Review** — agent reads the diff and posts structured comments
2. **AI Resolve** — agent reads open comments and applies fixes
3. **AI Tour** — agent builds a guided walkthrough of code
4. **AI Summary** — agent summarizes the review for a PR description or standup

All workflows run against a live `branchdiff` instance. Start it first:

```bash
branchdiff main..feature
# leave this terminal running — it serves the API on http://localhost:5391
```

---

## The primitives

### Commands the agent will use

```bash
branchdiff agent list --json                 # read all threads
branchdiff agent list --status open --json   # only unresolved
branchdiff agent diff                        # stream the current unified diff to stdout

branchdiff agent comment \
  --file src/app.ts --line 42 \
  --body "[must-fix] Missing null check — this throws when user is unauthenticated."

branchdiff agent general-comment \
  --body "[suggestion] Consider extracting the retry loop into a helper."

branchdiff agent reply <thread-id> --body "Fixed in commit abc123."
branchdiff agent resolve <thread-id> --summary "Added null check on line 42."
branchdiff agent dismiss <thread-id> --reason "Intentional — see RFC-123."
```

### Severity tags

Put a tag in square brackets at the start of the comment body. The export API + UI color-code them.

| Tag | Meaning | Blocks merge |
|---|---|---|
| `[must-fix]` | Breaks correctness, security, or intent | yes |
| `[suggestion]` | Improvement, not required | no |
| `[nit]` | Style, cosmetic, naming | no |
| `[question]` | Needs clarification from author | no |

### JSON export endpoint

```
GET http://localhost:<port>/api/threads/export?session=<id>&format=json
GET http://localhost:<port>/api/threads/export?session=<id>&format=markdown
GET http://localhost:<port>/api/threads/export?session=<id>&status=open
```

Response shape:

```json
{
  "summary": { "total": 5, "open": 3, "resolved": 2, "dismissed": 0 },
  "threads": [
    {
      "id": "abc123de-...",
      "filePath": "src/app.ts",
      "side": "new",
      "lines": "42-45",
      "severity": "must-fix",
      "status": "open",
      "comments": [
        { "author": "Agent", "authorType": "agent", "body": "[must-fix] ...", "createdAt": "..." }
      ]
    }
  ]
}
```

The session id is in the running instance — `branchdiff list --json` surfaces it, or check `GET /api/sessions/current`.

---

## Workflow 1 — AI Review

Goal: have an agent read the diff and post well-structured comments on the actual issues.

### Prompt template

```
You are reviewing a code diff using branchdiff.

1. Run `branchdiff agent diff` to see the full unified diff.
2. Review every changed file. For each genuine issue, post a comment with
   `branchdiff agent comment --file <path> --line <n> --body "[<severity>] <message>"`
3. Use these severity tags (put the tag first, in square brackets):
   - [must-fix]    — correctness, security, or logic bugs that MUST be fixed
   - [suggestion]  — improvements that would be nice
   - [nit]         — style, naming, cosmetic
   - [question]    — needs clarification
4. For multi-line issues add `--end-line <n>`. For comments about the whole diff
   use `branchdiff agent general-comment --body "..."`.
5. Be concrete. Quote the problematic code or reference the exact line. Avoid
   generic advice like "add error handling" — say *which* error, at *which* line,
   and *what* should happen.
6. Do not comment on style that is clearly the project's convention.
7. After posting comments, run `branchdiff agent list --status open` and confirm
   every comment is clear and actionable.

Start by running `branchdiff agent diff`.
```

### Example agent interaction

```
> branchdiff agent diff
[unified diff streams out]

> branchdiff agent comment --file packages/cli/src/server.ts --line 127 \
    --body "[must-fix] req.url can be undefined in Node's IncomingMessage type. \
            Destructuring it fails in strict mode. Guard with \`if (!req.url) return\`."

> branchdiff agent comment --file packages/ui/src/hooks/use-highlighter.ts --line 190 \
    --body "[suggestion] pendingLangsRef never shrinks on success. Consider \
            removing the lang from pendingLangsRef after loadedLangs.add(lang) \
            to bound memory on long-lived sessions."

> branchdiff agent general-comment \
    --body "[suggestion] Split diff-view.tsx (450 lines) — the scroll-sync logic \
            could move to a custom hook."
```

---

## Workflow 2 — AI Resolve

Goal: the agent reads open comments, applies the fixes, and marks threads resolved.

### Prompt template

```
You are resolving open review comments using branchdiff.

1. Run `branchdiff agent list --status open --json` to get all open threads.
2. For each thread:
   a. Read the comment body. If it's a [must-fix] or [suggestion] you can safely
      fix, apply the change to the referenced file.
   b. Verify the change compiles and doesn't break existing tests.
   c. Run `branchdiff agent resolve <thread-id> --summary "<what you did>"`.
   d. If the comment is a [question], run `branchdiff agent reply <thread-id>
      --body "<answer>"` instead of resolving.
   e. If you disagree with the comment, run `branchdiff agent dismiss
      <thread-id> --reason "<why>"` — don't silently skip.
3. Do NOT resolve [nit] comments unless the author is also fixing the nit —
   they're typically optional.
4. After all threads, run `branchdiff agent list --json` and summarize what you
   did: how many resolved, how many replied, how many dismissed.

Start by running `branchdiff agent list --status open --json`.
```

This replaces the need for a dedicated `/resolve` skill — the agent drives the CLI directly.

---

## Workflow 3 — AI Tour

Goal: have the agent build a guided walkthrough of a subsystem for onboarding a new engineer.

### Prompt template

```
You are creating a guided code tour using branchdiff.

Topic: <e.g. "How authentication works in this app">

1. Run `branchdiff agent tour-start --topic "<topic>" --body "<one-paragraph overview>" --json`
   and record the returned tour id.
2. Walk through the code in execution / logical order. For each meaningful
   location:
   `branchdiff agent tour-step --tour <id> \
      --file <path> --line <n> [--end-line <n>] \
      --body "<narrative explaining why this code exists>" \
      --annotation "<short inline label on the highlighted region>"`
3. Aim for 5–12 steps. Each step should teach one idea. Don't just narrate the
   code — explain the *why*, point out edge cases, reference related steps.
4. Finish with `branchdiff agent tour-done --tour <id>` — this marks it ready
   for viewers.
5. Tell the user how to view it: visit the URL in the branchdiff UI.

Start with tour-start.
```

Tours are visible in the branchdiff UI under the Tour panel.

---

## Workflow 4 — AI Summary

Goal: generate a review summary for a PR description, release notes, or a standup update.

### Prompt template

```
Summarize the current branchdiff review.

1. Run `curl -s http://localhost:<port>/api/threads/export?session=<id>&format=markdown`
   — or fetch &format=json and transform.
2. Produce:
   - One-sentence overall assessment (approve / changes requested / needs more eyes)
   - Top 3 must-fix items (file:line + one-line reason)
   - Any recurring themes (e.g. "three comments about missing null checks" →
     suggests a lint rule)
   - Count of open/resolved/dismissed.
3. Output as markdown suitable for pasting into a PR description.

Keep it under 150 words.
```

---

## Workflow 5 — Security Audit

Goal: focused security-only review — injection, auth bypass, secret leaks, unsafe deserialization, path traversal.

### Prompt template

```
You are performing a SECURITY-FOCUSED review using branchdiff.

1. Run `branchdiff agent diff` to see every changed line.
2. Scan ONLY for security issues. Skip style, perf, naming.
   Categories to flag:
   - Injection: SQL, command, HTML/XSS, template, LDAP, NoSQL, prompt
   - Authn/Authz: missing checks, privilege escalation, broken session logic
   - Secrets: hardcoded keys/tokens, .env values in code, leaked logs
   - Crypto: MD5/SHA1 for passwords, hand-rolled crypto, weak RNG
   - Deserialization: eval/Function/pickle on untrusted input
   - Path traversal / SSRF / open redirect
   - Dependency risk: vulnerable ranges, typosquat names
3. For each finding, post `branchdiff agent comment --file <p> --line <n>
   --body "[must-fix] <category>: <what, why it exploits, minimal fix>"`.
   Cite CWE where helpful (e.g. "CWE-89 SQL injection").
4. Zero findings IS a valid outcome — say so with
   `branchdiff agent general-comment --body "[question] No security issues found
   in this diff. Confirmed: <what you checked>."`
5. End with a one-line verdict via `branchdiff agent general-comment`.

Start by running `branchdiff agent diff`.
```

---

## Workflow 6 — Test Coverage Gaps

Goal: find untested new code paths and propose (or post) concrete test cases.

### Prompt template

```
You are finding TEST-COVERAGE gaps using branchdiff.

1. Run `branchdiff agent diff` to see additions.
2. For every new function, branch, or error path added, check the repo's test
   directory (e.g. `**/*.test.ts`, `tests/**`) for corresponding coverage.
3. For each uncovered path, post:
   `branchdiff agent comment --file <p> --line <n>
    --body "[suggestion] No test covers <path>. Suggested test:
    describe('<function>', () => { it('<case>', () => { ... }) })."`
4. Prioritize: error branches > new public API > new edge cases > happy path.
5. Don't flag private helpers already exercised transitively — call those out as
   `[nit]` at most.
6. End with `branchdiff agent general-comment` summarizing: N new paths, M
   covered, K missing, suggested areas to focus next.

Start by running `branchdiff agent diff`.
```

---

## Workflow 7 — Migration / Breaking-Change Review

Goal: diff two releases or branches and surface breaking API changes, schema migrations, and upgrade notes.

### Prompt template

```
You are reviewing a potentially BREAKING change using branchdiff.

Context: comparing <base-ref> → <new-ref>.

1. Run `branchdiff agent diff`.
2. Classify every change:
   - BREAKING: removed exports, changed function signatures, renamed public
     types, removed CLI flags, changed HTTP endpoints, DB schema changes
     without migration.
   - NON-BREAKING: additions, deprecations with shims, internal refactors.
3. For each BREAKING item post:
   `branchdiff agent comment --file <p> --line <n>
    --body "[must-fix] BREAKING: <what changed> — callers must <action>.
    Migration: <concrete steps>."`
4. Draft an UPGRADE.md snippet via `branchdiff agent general-comment --body`
   containing:
   - Summary of breaking changes
   - Per-change migration recipe (before / after code)
   - Rollback notes (can this be reverted safely?)
5. Flag any schema migration lacking a rollback path with [must-fix].

Start by running `branchdiff agent diff`.
```

---

## Workflow 8 — Dependency Review

Goal: review `package.json` / lockfile / import changes for risk (supply chain, licensing, bundle size).

### Prompt template

```
You are reviewing DEPENDENCY changes using branchdiff.

1. Run `branchdiff agent diff` and focus on:
   - `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`
   - new `import`/`require` lines referencing added packages
2. For every ADDED or MAJOR-BUMPED dependency, check:
   - Is it maintained (last publish < 1 year)? Owner reputation?
   - License compatible with the project's license?
   - Bundle size impact — is this imported into client code?
   - Is there a first-party alternative already in the repo?
   - Any known CVEs (check `npm audit` if available)?
3. Post findings:
   `branchdiff agent comment --file package.json --line <n>
    --body "[<severity>] <pkg>@<ver>: <risk>. Alternative: <x>."`
   Severities:
   - [must-fix] — abandoned, GPL in MIT project, known critical CVE
   - [suggestion] — large bundle, first-party alternative exists
   - [question] — unclear why this was added; ask author
4. Summarize net dependency delta via `branchdiff agent general-comment`:
   added N, removed M, bundle-size delta (estimate), any license mix concerns.

Start by running `branchdiff agent diff`.
```

---

## Pushing review comments to a GitHub PR

Once the agent has posted comments locally, push them to the actual PR:

```bash
# Inside branchdiff UI → PR panel → "Push comments"
# Or via the HTTP API — see packages/cli/src/review-routes.ts
```

Requires `gh` CLI authenticated (`gh auth login`) and the session to be associated with a PR (either `branchdiff <pr-url>` or `branchdiff` in a repo with a matching PR).

Pulling GitHub comments back into branchdiff works the same way — useful for resolving a reviewer's comments locally with an agent.

---

## Tips

- **Keep the branchdiff server running.** Agents hit `http://localhost:<port>/api/*` and invoke the CLI against the same session.
- **Pass `--json` when the agent needs structured output.** All `agent list/tour-*` commands support it.
- **Short IDs work everywhere.** The first 8 chars of a thread id is enough: `branchdiff agent resolve abc123de`.
- **Severity tags are parsed from comment body.** The export endpoint surfaces them under `severity`. Keep them consistent.
- **Nothing leaves your machine.** No telemetry, no cloud, no API key.

---

## Minimal agent setup (e.g. Claude Code)

1. `npm install -g branchdiff`
2. From inside your repo: `branchdiff main..feature`
3. In your agent chat, paste one of the workflow prompts above.
4. The agent runs `branchdiff agent *` commands via its shell tool.

No plugin, no install step, no MCP server required — it's just a CLI with structured output.
