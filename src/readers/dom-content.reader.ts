/**
 * Shared DOM readers for message content, used by all site adapters:
 *
 * - `domToMarkdown`: serializes a rendered message back to the markdown the model generated.
 *   The model writes (and later re-reads as history) markdown source, while the page shows
 *   rendered HTML. `textContent` drops the syntax (`**`, `#`, `|`, code fences, link URLs),
 *   merges block elements, includes UI chrome (copy buttons, screen-reader labels) and repeats
 *   KaTeX formulas 2–3 times. This walks the DOM and reverses the rendering instead.
 * - `readAttachments`: images and file cards attached to a user turn.
 * - `readToolCalls`: tool calls (web search, code execution, …) visible in an answer.
 * - `readArtifactText`: artifact / canvas side panels belonging to the latest answer.
 *
 * Context: content script
 * Docs: docs/modules.md#dom-content-reader, docs/decisions/0013-rich-message-content.md
 */

import type { AttachmentKind, ToolCallKind } from '../dto/chat-capture.dto';

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
  '.cdk-visually-hidden',
].join(', ');

/** Containers that start a new line. Everything else not handled explicitly is inline. */
const BLOCK_TAGS = new Set([
  'DIV',
  'SECTION',
  'ARTICLE',
  'MAIN',
  'HEADER',
  'FOOTER',
  'ASIDE',
  'NAV',
  'FIGURE',
  'FIGCAPTION',
  'DETAILS',
  'SUMMARY',
  'DL',
  'DT',
  'DD',
  'FORM',
  'FIELDSET',
  'LI',
]);

/**
 * Private-use placeholders for whitespace that must survive normalization (code blocks, list
 * indentation, line breaks typed by the user). Restored at the very end.
 */
const KEEP_SPACE = '\uE000';
const KEEP_TAB = '\uE001';
const KEEP_NEWLINE = '\uE002';
const LIST_INDENT = KEEP_SPACE.repeat(2);

/** Images at most this many px wide and high are icons/avatars, not attachments. */
const MAX_ICON_PX = 48;

export interface MarkdownOptions {
  /** Extra selector for site chrome to drop (thinking drawers, tool blocks, artifact cards). */
  skip?: string;
  /** Keep line breaks inside text (user prompts are rendered with `white-space: pre-wrap`). */
  preserveLineBreaks?: boolean;
}

interface RenderContext {
  skip: string;
  listDepth: number;
  preserveLineBreaks: boolean;
}

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

function normalize(raw: string): string {
  return raw
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
  for (const child of Array.from(element.childNodes)) {
    out += renderNode(child, ctx);
  }
  return out;
}

function renderText(text: string, ctx: RenderContext): string {
  if (!ctx.preserveLineBreaks || !text.trim()) return text.replace(/\s+/g, ' ');
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n/g, KEEP_NEWLINE);
}

function renderNode(node: Node, ctx: RenderContext): string {
  if (node.nodeType === Node.TEXT_NODE) return renderText(node.textContent ?? '', ctx);
  if (!(node instanceof Element)) return '';

  const math = renderMath(node);
  if (math !== null) return math;
  if (node.matches(ctx.skip)) return '';

  const tag = node.tagName.toUpperCase();
  switch (tag) {
    case 'BR':
      return ctx.preserveLineBreaks ? KEEP_NEWLINE : '\n';
    case 'HR':
      return block('---');
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6': {
      const text = renderChildren(node, ctx).replace(/\s+/g, ' ').trim();
      return text ? block(`${'#'.repeat(Number(tag[1]))} ${text}`) : '';
    }
    case 'P':
      return block(renderChildren(node, ctx));
    case 'PRE':
      return block(renderCodeBlock(node));
    case 'UL':
    case 'OL':
      return block(renderList(node, ctx));
    case 'BLOCKQUOTE': {
      const inner = normalizeForPrefix(renderChildren(node, ctx));
      return inner ? block(inner.replace(/^/gm, '> ')) : '';
    }
    case 'TABLE':
      return block(renderTable(node, ctx));
    case 'STRONG':
    case 'B':
      return surround(renderChildren(node, ctx), '**');
    case 'EM':
    case 'I':
      return surround(renderChildren(node, ctx), '*');
    case 'DEL':
    case 'S':
      return surround(renderChildren(node, ctx), '~~');
    case 'CODE':
      return surround(node.textContent ?? '', '`');
    case 'A':
      return renderLink(node, ctx);
    default: {
      const content = renderChildren(node, ctx);
      return BLOCK_TAGS.has(tag) ? `\n${content}\n` : content;
    }
  }
}

/** Collapses a rendered fragment so every line can be prefixed (blockquotes). */
function normalizeForPrefix(raw: string): string {
  return raw
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** TeX source of a KaTeX / MathJax / Gemini formula, or null if `el` is not a formula. */
function renderMath(el: Element): string | null {
  const dataMath = el.getAttribute('data-math');
  if (dataMath !== null) {
    const display = el.classList.contains('math-block') || el.tagName.toUpperCase() === 'DIV';
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
  const ordered = list.tagName.toUpperCase() === 'OL';
  let index = Number(list.getAttribute('start') ?? '1') || 1;
  const indent = LIST_INDENT.repeat(ctx.listDepth);
  const items: string[] = [];

  for (const item of Array.from(list.children)) {
    if (item.tagName.toUpperCase() !== 'LI' || item.matches(ctx.skip)) continue;
    const body = renderChildren(item, { ...ctx, listDepth: ctx.listDepth + 1 })
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
    const marker = ordered ? `${index++}. ` : '- ';
    items.push(`${indent}${marker}${body}`);
  }
  return items.join('\n');
}

function renderTable(table: Element, ctx: RenderContext): string {
  const rows = Array.from(table.querySelectorAll('tr')).filter(
    (row) => row.closest('table') === table,
  );
  const lines = rows.map((row) => {
    const cells = Array.from(row.children)
      .filter((cell) => ['TD', 'TH'].includes(cell.tagName.toUpperCase()))
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

/** Matches of `selector` inside `root`, without ones nested in another match. */
function outermost(root: Element, selector: string): Element[] {
  if (!selector) return [];
  return Array.from(root.querySelectorAll(selector)).filter((el) => {
    const outer = el.parentElement?.closest(selector);
    return !outer || !root.contains(outer);
  });
}

function isContentImage(img: HTMLImageElement): boolean {
  const rect = img.getBoundingClientRect();
  const isIcon =
    rect.width > 0 && rect.height > 0 && rect.width <= MAX_ICON_PX && rect.height <= MAX_ICON_PX;
  return !isIcon && img.closest('[aria-hidden="true"], button') === null;
}

/**
 * Attachments of one user turn. Every outermost `fileSelector` match is one attachment: an
 * image if it shows a content image (image upload thumbnail), otherwise a file (document,
 * pasted-content card). Content images outside such cards count as images.
 */
export function readAttachments(roots: readonly Element[], fileSelector: string): AttachmentKind[] {
  const kinds: AttachmentKind[] = [];
  for (const root of roots) {
    const tiles = outermost(root, fileSelector);
    for (const tile of tiles) {
      kinds.push(Array.from(tile.querySelectorAll('img')).some(isContentImage) ? 'image' : 'file');
    }
    for (const img of Array.from(root.querySelectorAll('img'))) {
      if (tiles.some((tile) => tile.contains(img))) continue;
      if (isContentImage(img)) kinds.push('image');
    }
  }
  return kinds;
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

/** Tool calls visible in the latest answer (`roots` = its role nodes). */
export function readToolCalls(roots: readonly Element[], selectors: ToolSelectors): ToolCallKind[] {
  const count = (selector: string) =>
    roots.reduce((sum, root) => sum + outermost(root, selector).length, 0);

  const searches = count(selectors.search);
  const hasSearchEvidence =
    selectors.searchEvidence !== '' &&
    roots.some((root) => root.querySelector(selectors.searchEvidence) !== null);

  return [
    ...Array<ToolCallKind>(searches > 0 ? searches : hasSearchEvidence ? 1 : 0).fill('search'),
    ...Array<ToolCallKind>(count(selectors.code)).fill('code'),
    ...Array<ToolCallKind>(count(selectors.other)).fill('other'),
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
  const hasCard = roots.some(
    (root) => root.matches(cardSelector) || root.querySelector(cardSelector) !== null,
  );
  if (!hasCard || !document.body) return '';
  return outermost(document.body, panelSelector)
    .filter((panel) => !roots.some((root) => root.contains(panel)))
    .map((panel) => domToMarkdown(panel))
    .filter(Boolean)
    .join('\n\n');
}
