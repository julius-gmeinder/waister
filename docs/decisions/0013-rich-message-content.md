# 0013: Markdown reconstruction, attachments, artifacts and tool calls

**Status:** Accepted (2026-11-21)

## Context

`element.textContent` on a rendered chat message drops markdown syntax (`#`, `**`, `|`, code
fences, link URLs), merges adjacent block elements, includes UI chrome (copy buttons,
screen-reader labels, code-block headers), and repeats KaTeX formulas 2–3 times (MathML + TeX
annotation + visual spans). Furthermore:

- Our heuristic tokenizers ignored all whitespace, making newlines and code indentation free.
- Long documents written into an Artifact / Canvas side panel live outside the message node, so
  a 2,000-token artifact was counted as a ~5-token card label.
- Image uploads, file / pasted-content cards, and hidden tool-call tokens (web search results,
  code interpreter execution) were not counted at all.

## Decision

1. **Shared DOM → Markdown serializer** (`src/readers/dom-content.reader.ts`):
   - `domToMarkdown(root, options)` walks the message DOM, skips UI chrome (`button`, `svg`,
     `[aria-hidden="true"]`, `.sr-only`, site-specific action rows, thinking blocks, tool blocks,
     and artifact cards), extracts the single TeX source from KaTeX/MathJax formulas, preserves
     code-block fences, language tags, newlines and indentation, and reconstructs headings,
     lists, blockquotes, pipe tables and links.
2. **Whitespace tokens in `TokenizerService`**:
   - `countWhitespaceTokens` adds ~1 token per newline run and leading indentation run (`>= 2`
     spaces or tabs).
3. **Artifacts / Canvas (`artifactText`)**:
   - `readArtifactText` reads open artifact/canvas side panels when the latest assistant turn
     contains an artifact card and adds their tokenized markdown to `output` (current turn only,
     not cached for history).
4. **Attachments (`userAttachments` & `ChatTurn.attachments`)**:
   - `readAttachments` detects uploaded content images (`'image'`) and file / pasted-content
     cards (`'file'`) per user turn. `TokenizerService` adds fixed per-provider estimates from
     `config.json` (`tokenizer.<provider>.attachmentTokens`) to `input` and `history`.
5. **Tool calls (`toolCalls` & `TokenBreakdown.tools`)**:
   - `readToolCalls` detects visible search, code-execution, and other tool calls on the latest
     assistant turn.
   - `EstimationService` estimates hidden tool tokens per call (`estimation.tools` in
     `config.json`) into a new `tools` breakdown category (`totalTokens = input + history +
output + thinking + tools + overhead`).
   - `PromptStoreService` adds `tool_tokens INTEGER NOT NULL DEFAULT 0` with an idempotent
     `ALTER TABLE` migration for existing IndexedDB snapshots, and the popup `Breakdown` renders
     a `Tools` row (`Wrench` icon).

## Consequences

- Markdown formatting, code blocks, tables, links and math formulas are tokenized close to the
  raw markdown source the model generated.
- UI buttons, screen-reader labels and KaTeX duplicate trees no longer inflate token counts.
- Open Artifact / Canvas panels, user attachments, and tool calls contribute to the breakdown and
  `totalTokens`, while existing SQLite databases migrate seamlessly on service-worker startup.
