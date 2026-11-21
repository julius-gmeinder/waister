/**
 * DomContentReader: shared DOM readers for message content (markdown, attachments, tool calls,
 * artifact panels), used by all site adapters.
 * The model writes (and later re-reads as history) markdown source, but the page shows rendered
 * HTML. `textContent` would drop the syntax, merge blocks, include UI chrome and repeat KaTeX
 * formulas, so `domToMarkdown` walks the DOM and reverses the rendering instead.
 *
 * Context: content
 * Docs: docs/modules.md#dom-content-reader
 */

import { capture } from '../config/config.json';
import type { AttachmentKind, ToolCallKind } from '../dto/chat-capture.dto';

const { maxIconPx } = capture.attachments;

/**
 * Never part of the message text: controls, icons, media, hidden and screen-reader-only nodes.
 * Images are counted separately as attachments.
 */
const CHROME_SELECTOR = [
  'button',
  'svg',
  'style',
  'script',
  'noscript',
  'template',
  'input',
  'textarea',
  'select',
  'img',
  'picture',
  'video',
  'audio',
  'canvas',
  'iframe',
  '[hidden]',
  '[aria-hidden="true"]',
  '[role="toolbar"]',
  '[role="tooltip"]',
  '.sr-only',
  '.visually-hidden',
  '.cdk-visually-hidden', // Angular CDK (Gemini)
].join(', ');

/** Containers that start a new line. Everything else not handled explicitly is inline. */
const BLOCK_TAGS = new Set([
  'div',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'aside',
  'nav',
  'figure',
  'figcaption',
  'details',
  'summary',
  'dl',
  'dt',
  'dd',
  'form',
  'fieldset',
  'li',
]);

/**
 * Private-use placeholders for whitespace that must survive normalization (code blocks, list
 * indentation, line breaks typed by the user). Restored at the very end.
 */
const KEEP_SPACE = '';
const KEEP_TAB = '';
const KEEP_NEWLINE = '';
const LIST_INDENT = KEEP_SPACE.repeat(2);

/** Whitespace-only text between user paragraphs keeps at most one blank line. */
const MAX_GAP_NEWLINES = 2;

export interface MarkdownOptions {
  /** Extra selector for site chrome to drop (thinking drawers, tool blocks, artifact cards). */
  skip?: string;
  /** Keep line breaks inside text (user prompts are rendered with `white-space: pre-wrap`). */
  preserveLineBreaks?: boolean;
}

export interface ToolSelectors {
  /** Each outermost match is one web search / browse call. */
  search: string;
  /** Each outermost match is one code execution call. */
  code: string;
  /** Each outermost match is one other tool call. */
  other: string;
  /** Shown when an answer used web search (citations, source chips): at least one search. */
  searchEvidence: string;
}

interface RenderContext {
  skip: string;
  listDepth: number;
  preserveLineBreaks: boolean;
}

/** Markdown reconstructed from the rendered `root`, with UI chrome removed. */
export function domToMarkdown(
  root: Element | null | undefined,
  options: MarkdownOptions = {},
): string {
  if (!root) return '';
  const ctx: RenderContext = {
    skip: options.skip ? `${CHROME_SELECTOR}, ${options.skip}` : CHROME_SELECTOR,
    listDepth: 0,
    preserveLineBreaks: options.preserveLineBreaks ?? false,
  };
  return normalize(renderChildren(root, ctx));
}

/**
 * Matches of `selector` at or inside `root`, without ones nested in another match. If `root`
 * itself matches it is the only result. An empty selector matches nothing.
 */
export function outermost(root: Element, selector: string): Element[] {
  if (!selector) return [];
  if (root.matches(selector)) return [root];
  return Array.from(root.querySelectorAll(selector)).filter((el) => {
    const outer = el.parentElement?.closest(selector);
    return !outer || !root.contains(outer);
  });
}

/**
 * Attachments of one user turn. Every outermost `fileSelector` match is one attachment: an
 * image if it shows a content image (image upload thumbnail), otherwise a file (document,
 * pasted-content card). Content images outside such cards count as images.
 */
export function readAttachments(roots: readonly Element[], fileSelector: string): AttachmentKind[] {
  const kinds: AttachmentKind[] = [];
  for (const root of roots) {
    const images = Array.from(root.querySelectorAll('img')).filter(isContentImage);
    const tiles = outermost(root, fileSelector);
    for (const tile of tiles) {
      kinds.push(images.some((img) => tile.contains(img)) ? 'image' : 'file');
    }
    for (const img of images) {
      if (!tiles.some((tile) => tile.contains(img))) kinds.push('image');
    }
  }
  return kinds;
}

/**
 * Counts distinct tool invocations inside `roots` for a tool selector.
 * Collapses adjacent/sibling matches (e.g., code input + execution output in the same wrapper)
 * so one tool run with multiple status badges isn't multiplied.
 */
function countDistinctToolBlocks(roots: readonly Element[], selector: string): number {
  if (!selector) return 0;
  let total = 0;
  for (const root of roots) {
    const matches = outermost(root, selector);
    if (matches.length <= 1) {
      total += matches.length;
      continue;
    }
    const distinctParents = new Set<Element>();
    for (const el of matches) {
      distinctParents.add(el.parentElement ?? el);
    }
    total += distinctParents.size;
  }
  return total;
}

/** Tool calls visible in the latest answer (`roots` = its role nodes). */
export function readToolCalls(roots: readonly Element[], selectors: ToolSelectors): ToolCallKind[] {
  const repeat = (kind: ToolCallKind, times: number): ToolCallKind[] =>
    Array.from({ length: times }, () => kind);

  // Count at most 1 web search invocation per assistant turn root that shows search blocks or
  // citation evidence, so 5 source chips or multiple search status badges in 1 turn = 1 search.
  const searchCount = roots.filter(
    (root) => hasMatch(root, selectors.search) || hasMatch(root, selectors.searchEvidence),
  ).length;

  return [
    ...repeat('search', searchCount),
    ...repeat('code', countDistinctToolBlocks(roots, selectors.code)),
    ...repeat('other', countDistinctToolBlocks(roots, selectors.other)),
  ];
}

/**
 * Content of artifact / canvas side panels, but only if the latest answer (`roots`) contains an
 * artifact card, so a panel left open from an earlier turn isn't counted for an unrelated answer.
 * The panel lives outside the message, so without this the document counts as a few tokens.
 */
export function readArtifactText(
  roots: readonly Element[],
  cardSelector: string,
  panelSelector: string,
): string {
  if (!roots.some((root) => hasMatch(root, cardSelector))) return '';
  return outermost(document.body, panelSelector)
    .filter((panel) => !roots.some((root) => root.contains(panel)))
    .map((panel) => domToMarkdown(panel))
    .filter(Boolean)
    .join('\n\n');
}

/** True if `root` or anything inside it matches `selector`. An empty selector matches nothing. */
function hasMatch(root: Element, selector: string): boolean {
  return selector !== '' && (root.matches(selector) || root.querySelector(selector) !== null);
}

/**
 * Collapses runs of spaces/tabs, trims spaces around newlines and caps consecutive blank lines.
 * Callers pick the cap: paragraphs allow 1, list items 0.
 */
function collapseWhitespace(raw: string, maxBlankLines: number): string {
  return raw
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(new RegExp(`\\n{${maxBlankLines + 2},}`, 'g'), '\n'.repeat(maxBlankLines + 1))
    .trim();
}

/** Final pass over the rendered markdown: collapse whitespace, then restore the KEEP_* nodes. */
function normalize(raw: string): string {
  return collapseWhitespace(raw, 1)
    .split(KEEP_SPACE)
    .join(' ')
    .split(KEEP_TAB)
    .join('\t')
    .split(KEEP_NEWLINE)
    .join('\n');
}

function protectWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, KEEP_SPACE)
    .replace(/\t/g, KEEP_TAB)
    .replace(/\n/g, KEEP_NEWLINE);
}

function block(content: string): string {
  const trimmed = content.trim();
  return trimmed ? `\n\n${trimmed}\n\n` : '';
}

/** Wraps `text` in markers but keeps its outer whitespace outside them (`a **b** c`). */
function surround(text: string, open: string, close: string = open): string {
  const core = text.trim();
  if (!core) return text;
  const leading = /^\s*/.exec(text)?.[0] ?? '';
  const trailing = /\s*$/.exec(text)?.[0] ?? '';
  return `${leading}${open}${core}${close}${trailing}`;
}

function renderChildren(element: Element, ctx: RenderContext): string {
  let out = '';
  for (const child of element.childNodes) {
    out += renderNode(child, ctx);
  }
  return out;
}

function renderText(text: string, ctx: RenderContext): string {
  const collapsed = text.replace(/\s+/g, ' ');
  if (!ctx.preserveLineBreaks) return collapsed;

  if (!text.trim()) {
    // Whitespace-only node: a plain gap between inline nodes, unless it carries the line breaks
    // between two user paragraphs.
    const lineBreaks = text.match(/\r\n?|\n/g)?.length ?? 0;
    return lineBreaks > 0 ? KEEP_NEWLINE.repeat(Math.min(lineBreaks, MAX_GAP_NEWLINES)) : collapsed;
  }
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n/g, KEEP_NEWLINE);
}

function renderNode(node: Node, ctx: RenderContext): string {
  if (node.nodeType === Node.TEXT_NODE) return renderText(node.textContent ?? '', ctx);
  if (!(node instanceof Element)) return '';

  // Before the skip check: KaTeX / MathJax wrap their rendering in aria-hidden nodes, but we want
  // the TeX source from the annotation.
  const math = renderMath(node);
  if (math !== null) return math;
  if (node.matches(ctx.skip)) return '';

  const tag = node.localName;
  switch (tag) {
    case 'br':
      return ctx.preserveLineBreaks ? KEEP_NEWLINE : '\n';
    case 'hr':
      return block('---');
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const text = renderChildren(node, ctx).replace(/\s+/g, ' ').trim();
      return text ? block(`${'#'.repeat(Number(tag[1]))} ${text}`) : '';
    }
    case 'p':
      return block(renderChildren(node, ctx));
    case 'pre':
      return block(renderCodeBlock(node));
    case 'ul':
    case 'ol':
      return block(renderList(node, ctx));
    case 'blockquote': {
      const inner = collapseWhitespace(renderChildren(node, ctx), 1);
      return inner ? block(inner.replace(/^/gm, '> ')) : '';
    }
    case 'table':
      return block(renderTable(node, ctx));
    case 'strong':
    case 'b':
      return surround(renderChildren(node, ctx), '**');
    case 'em':
    case 'i':
      return surround(renderChildren(node, ctx), '*');
    case 'del':
    case 's':
      return surround(renderChildren(node, ctx), '~~');
    case 'code':
      // Backticks inside inline code aren't escaped: negligible for token counts.
      return surround(node.textContent ?? '', '`');
    case 'a':
      return renderLink(node, ctx);
    default: {
      const content = renderChildren(node, ctx);
      return BLOCK_TAGS.has(tag) ? `\n${content}\n` : content;
    }
  }
}

/** TeX source of a KaTeX / MathJax / Gemini formula, or null if `el` is not a formula. */
function renderMath(el: Element): string | null {
  const dataMath = el.getAttribute('data-math');
  if (dataMath !== null) {
    const display = el.classList.contains('math-block') || el.localName === 'div';
    return display ? block(`$$${dataMath}$$`) : `$${dataMath}$`;
  }

  const isKatexDisplay = el.classList.contains('katex-display');
  const isKatex = el.classList.contains('katex');
  const isMathJax = el.localName === 'mjx-container';
  const isMathMl = el.localName === 'math';
  if (!isKatexDisplay && !isKatex && !isMathJax && !isMathMl) return null;

  const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
  const tex = (
    annotation?.textContent ??
    (isMathMl ? el.textContent : el.querySelector('math')?.textContent) ??
    ''
  ).trim();
  if (!tex) return '';
  const display = isKatexDisplay || el.getAttribute('display') === 'block';
  return display ? block(`$$${tex}$$`) : `$${tex}$`;
}

function renderCodeBlock(pre: Element): string {
  const code = pre.querySelector('code');
  // Code-block headers (language label, copy button) often sit inside `<pre>`: only read `<code>`.
  const source = (code ?? pre).textContent ?? '';
  const languageClass = /(?:^|\s)(?:language|lang)-([\w#+.-]+)/.exec(
    `${code?.className ?? ''} ${pre.className}`,
  );
  const language =
    languageClass?.[1] ??
    code?.getAttribute('data-language') ??
    pre.getAttribute('data-language') ??
    '';
  const body = source.replace(/\n+$/, '');
  return `\`\`\`${language}${KEEP_NEWLINE}${protectWhitespace(body)}${KEEP_NEWLINE}\`\`\``;
}

function renderList(list: Element, ctx: RenderContext): string {
  const ordered = list.localName === 'ol';
  let index = Number(list.getAttribute('start') ?? '1') || 1;
  const indent = LIST_INDENT.repeat(ctx.listDepth);
  const items: string[] = [];

  for (const item of list.children) {
    if (item.localName !== 'li' || item.matches(ctx.skip)) continue;
    const body = collapseWhitespace(
      renderChildren(item, { ...ctx, listDepth: ctx.listDepth + 1 }),
      0,
    );
    const marker = ordered ? `${index++}. ` : '- ';
    items.push(`${indent}${marker}${body}`);
  }
  return items.join('\n');
}

/** Pipes in cells and colspan/rowspan aren't handled: negligible for token counts. */
function renderTable(table: Element, ctx: RenderContext): string {
  const rows = Array.from(table.querySelectorAll('tr')).filter(
    (row) => row.closest('table') === table,
  );
  const lines = rows.map((row) => {
    const cells = Array.from(row.children)
      .filter((cell) => cell.localName === 'td' || cell.localName === 'th')
      .map((cell) => renderChildren(cell, ctx).replace(/\s+/g, ' ').trim());
    return `| ${cells.join(' | ')} |`;
  });
  const columns = rows[0]?.children.length ?? 0;
  if (lines.length > 0 && columns > 0) {
    lines.splice(1, 0, `|${' --- |'.repeat(columns)}`);
  }
  return lines.join('\n');
}

function renderLink(anchor: Element, ctx: RenderContext): string {
  const text = renderChildren(anchor, ctx);
  const label = text.trim();
  const href = anchor.getAttribute('href') ?? '';
  if (!label || !/^https?:/i.test(href) || label === href) return text;
  return surround(text, '[', `](${href})`);
}

function isContentImage(img: HTMLImageElement): boolean {
  if (
    img.closest(
      '[aria-hidden="true"], button, [class*="avatar"], [data-testid*="avatar"], [data-test-id*="avatar"]',
    ) !== null
  ) {
    return false;
  }
  const alt = (img.getAttribute('alt') ?? '').toLowerCase();
  if (alt.includes('avatar') || alt.includes('profile') || alt.includes('icon')) {
    return false;
  }

  const rect = img.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return rect.width > maxIconPx || rect.height > maxIconPx;
  }

  // Unlaid-out / virtualized DOM (0x0 bounding rect): require explicit dimensions > maxIconPx so
  // 0x0 decorative icons or unrendered avatars are never misclassified as uploaded images.
  const attrW = Number(img.getAttribute('width') ?? 0) || img.naturalWidth || 0;
  const attrH = Number(img.getAttribute('height') ?? 0) || img.naturalHeight || 0;
  return attrW > maxIconPx || attrH > maxIconPx;
}
