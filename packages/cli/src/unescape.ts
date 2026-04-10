/**
 * Remove shell-introduced backslash escapes from markdown text.
 *
 * AI agents calling the CLI via shell commands often produce body text
 * with escaped backticks (\`) and escaped quotes (\") because they
 * are constructing shell strings. These backslashes become markdown
 * escape sequences that suppress formatting (e.g. \` renders as a
 * literal backtick instead of inline code).
 *
 * This function reverses those escapes so the markdown renders correctly.
 */
export function unescapeMarkdown(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\`/g, '`')
    .replace(/\\"/g, '"');
}
