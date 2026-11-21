/**
 * Gemini SiteAdapter (gemini.google.com): selectors and reads for one chat app.
 * Turns are Angular custom elements (`<user-query>`, `<model-response>`), which are stable tag
 * names. Class names and `data-test-id`s inside them are not, so they only back up the tags. UI
 * labels are localized, so buttons are found by class / icon first.
 *
 * Context: content
 * Docs: docs/modules.md#site-adapters
 */

import { capture } from '../../config/config.json';
import type { AttachmentKind, ChatTurn, ModelInfo, ToolCallKind } from '../../dto/chat-capture.dto';
import {
  domToMarkdown,
  outermost,
  readArtifactText,
  readAttachments,
  readToolCalls,
  type ToolSelectors,
} from '../dom-content.reader';
import type { SiteAdapter } from './site-adapter.types';
import {
  buildHistory,
  buildModelInfo,
  hasMatch,
  joinMarkdown,
  joinSelectors,
  latestOf,
  makeTurn,
  queryOutermost,
  readText,
  readTurnNodes,
  rootsOf,
  toolBlockSelector,
  unknownModel,
} from './site.helpers';

const GEMINI_SELECTORS = {
  promptInput: 'rich-textarea .ql-editor, div[contenteditable="true"][role="textbox"]',
  /** The same button turns into the stop button while generating, hence `:not(.stop)`. */
  sendButton: 'button.send-button:not(.stop), button[aria-label="Send message"]',
  /** Class/icon first: aria-labels are localized, the English ones are only a fallback. */
  stopButton:
    'button.send-button.stop, .send-button [fonticon="stop"], .send-button [data-mat-icon-name="stop"], button[aria-label="Stop response"], button[aria-label="Stop generating"]',
  streamingIndicator:
    'model-response[is-streaming="true"], model-response .mat-mdc-progress-spinner, [data-test-id="streaming-indicator"]',
  userTurn: 'user-query',
  assistantTurn: 'model-response',
  /** Typed text inside `<user-query>`, without attachment previews and screen-reader prefixes. */
  userText: '.query-text',
  /** Answer text containers inside `<model-response>`. */
  responseText: 'message-content, .model-response-text',
  modelSelector:
    '[data-test-id="bard-mode-menu-button"], .input-area-switch-label, button[aria-label*="mode"]',
  thinkingDrawer:
    'model-thoughts, [data-test-id="model-thoughts"], .thoughts-container, [data-test-id*="thought"], details[class*="thought"]',
  /** Canvas chip inside the answer. */
  artifactCard: 'immersive-entry-chip',
  /** Canvas side panel with the document / code. */
  artifactPanel: 'immersive-panel, [data-test-id="immersive-panel"]',
  /** Inside the answer but not model output: code-block header, action row, source citations. */
  messageChrome:
    '.code-block-decoration, message-actions, sources-carousel-inline, source-footnote, sources-list',
  /** Non-prompt chrome inside `<user-query>` (e.g. "You said" heading) skipped on fallback. */
  userChrome: 'h1, h2, h3, .user-query-header, [data-test-id*="user-query-header"]',
  // UNVERIFIED: the selector below was not checked on the live site.
  /** File / image cards in a user turn. */
  attachmentTile: 'user-query-file-preview, [class*="file-preview"], [data-test-id*="file"]',
} as const;

// UNVERIFIED: all tool selectors.
const GEMINI_TOOLS: ToolSelectors = {
  search: '',
  code: 'code-execution-result, [data-test-id*="code-execution"]',
  other: '',
  searchEvidence:
    'sources-carousel-inline, source-footnote, sources-list, .source-inline-chip, [data-test-id="sources-carousel"], [data-test-id="source-chip"]',
};

/** Not model output: thinking drawer, UI chrome, canvas chips and tool blocks (counted separately). */
const GEMINI_MESSAGE_CHROME = joinSelectors(
  GEMINI_SELECTORS.thinkingDrawer,
  GEMINI_SELECTORS.messageChrome,
  GEMINI_SELECTORS.artifactCard,
  toolBlockSelector(GEMINI_TOOLS),
);

const GEMINI_USER_CHROME = joinSelectors(
  GEMINI_SELECTORS.attachmentTile,
  GEMINI_SELECTORS.userChrome,
);

const GEMINI_ALL_TURNS = joinSelectors(GEMINI_SELECTORS.userTurn, GEMINI_SELECTORS.assistantTurn);

/** Markdown of the typed text. Falls back to the whole `<user-query>` if `.query-text` is missing. */
function readUserText(userQuery: Element | undefined): string {
  return domToMarkdown(userQuery?.querySelector(GEMINI_SELECTORS.userText) ?? userQuery, {
    skip: GEMINI_USER_CHROME,
    preserveLineBreaks: true,
  });
}

function readTurnAttachments(userQuery: Element | undefined): AttachmentKind[] {
  return userQuery ? readAttachments([userQuery], GEMINI_SELECTORS.attachmentTile) : [];
}

/**
 * Excludes the `<model-thoughts>` drawer so thinking summaries aren't counted as output and don't
 * trigger `tStreamStart` while the model is still thinking.
 */
function readResponseText(response: Element | undefined): string {
  if (!response) return '';
  // Outermost only: `.model-response-text` can sit inside `<message-content>`.
  const answers = outermost(response, GEMINI_SELECTORS.responseText).filter(
    (el) => el.closest(GEMINI_SELECTORS.thinkingDrawer) === null,
  );
  if (answers.length > 0) return joinMarkdown(answers, { skip: GEMINI_MESSAGE_CHROME });

  // No answer container yet but a thinking drawer: the visible answer hasn't started.
  if (response.querySelector(GEMINI_SELECTORS.thinkingDrawer) !== null) return '';

  return domToMarkdown(response, { skip: GEMINI_MESSAGE_CHROME });
}

export const geminiSite: SiteAdapter = {
  provider: 'google',

  matches(host: string): boolean {
    return host === 'gemini.google.com';
  },

  readModel(): ModelInfo {
    const rawLabel = readText(document.querySelector(GEMINI_SELECTORS.modelSelector));
    const latest = latestOf(GEMINI_SELECTORS.assistantTurn);
    const hasThinkingDrawer = hasMatch(rootsOf(latest), GEMINI_SELECTORS.thinkingDrawer);
    return rawLabel
      ? buildModelInfo(rawLabel, hasThinkingDrawer, capture.models.gemini)
      : unknownModel(capture.models.gemini.fallbackName, hasThinkingDrawer);
  },

  readUserInput(): string {
    return readUserText(latestOf(GEMINI_SELECTORS.userTurn));
  },

  readUserAttachments(): AttachmentKind[] {
    return readTurnAttachments(latestOf(GEMINI_SELECTORS.userTurn));
  },

  readResponse(): string {
    return readResponseText(latestOf(GEMINI_SELECTORS.assistantTurn));
  },

  readArtifactText(): string {
    return readArtifactText(
      rootsOf(latestOf(GEMINI_SELECTORS.assistantTurn)),
      GEMINI_SELECTORS.artifactCard,
      GEMINI_SELECTORS.artifactPanel,
    );
  },

  readToolCalls(): ToolCallKind[] {
    return readToolCalls(rootsOf(latestOf(GEMINI_SELECTORS.assistantTurn)), GEMINI_TOOLS);
  },

  readHistory(): ChatTurn[] {
    return buildHistory(
      readTurnNodes(GEMINI_ALL_TURNS, GEMINI_SELECTORS.userTurn),
      ({ role, node }) =>
        role === 'user'
          ? makeTurn(role, readUserText(node), readTurnAttachments(node))
          : makeTurn(role, readResponseText(node), []),
    );
  },

  countUserMessages(): number {
    return queryOutermost(GEMINI_SELECTORS.userTurn).length;
  },

  countResponses(): number {
    return queryOutermost(GEMINI_SELECTORS.assistantTurn).length;
  },

  isGenerating(): boolean {
    const hasStopButton = document.querySelector(GEMINI_SELECTORS.stopButton) !== null;
    const hasStreamingIndicator =
      document.querySelector(GEMINI_SELECTORS.streamingIndicator) !== null;
    return hasStopButton || hasStreamingIndicator;
  },

  isStreamingVisibleText(): boolean {
    return readResponseText(latestOf(GEMINI_SELECTORS.assistantTurn)).length > 0;
  },

  isPromptInput(target: Element): boolean {
    return target.closest(GEMINI_SELECTORS.promptInput) !== null;
  },

  isSendButton(target: Element): boolean {
    return target.closest(GEMINI_SELECTORS.sendButton) !== null;
  },
};
