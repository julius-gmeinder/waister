/**
 * Consolidated DOM Capture Strategy (`dom-capture.strategy.ts`).
 *
 * Owns the WHEN for all supported site adapters (`chatgpt.site.ts`, `claude.site.ts`,
 * `gemini.site.ts`). The adapters only answer DOM questions, this strategy runs one shared
 * turn-detection loop on top of them:
 *   1. Selects the active SiteAdapter for the current host.
 *   2. Watches the whole document (chat apps are SPAs and replace their containers on navigation)
 *      and the composer's Enter key / send button to detect the prompt send (`t0`), the first
 *      visible response text (`tStreamStart`) and the end of the response (`t1`).
 *   3. A response counts as finished once the site's "generating" indicator is gone and the
 *      response text has stopped changing. If the indicator was never seen (e.g. its selector
 *      doesn't match a localized UI), a longer text-stability window decides on its own.
 *   4. Calculates `thinkingTimeMs = tStreamStart - t0` and `latencyMs = t1 - t0`, reads the DOM
 *      texts (`userInput`, `response`, `chatHistory`, `model`) and builds a `ChatCaptureDto`.
 *   5. Forwards the `ChatCaptureDto` via `ESTIMATE_PROMPT` to `handleEstimation` in
 *      `src/handlers/estimation.handler.ts`.
 *
 * Context: content script
 * Docs: docs/modules.md#reader-strategies, docs/pipeline.md
 */

import type { ChatCaptureDto } from '../../dto/chat-capture.dto';
import type { EstimatePromptMessage } from '../../messages/runtime-messages';
import { chatgptSite } from '../sites/chatgpt.site';
import { claudeSite } from '../sites/claude.site';
import { geminiSite } from '../sites/gemini.site';
import type { SiteAdapter } from '../sites/site-adapter.types';
import type { OnCaptureReady, ReaderStrategy, TurnTimings } from './reader-strategy.types';

/**
 * Registry of all supported site adapters consolidated by this strategy.
 */
export const SUPPORTED_SITES: readonly SiteAdapter[] = [chatgptSite, claudeSite, geminiSite];

/** Quiet time after the generating indicator disappeared before a response counts as done. */
const SETTLE_MS = 400;
/** Quiet time used instead when the site's generating indicator was never seen. */
const TEXT_STABLE_MS = 2500;
/** Bursts of DOM mutations are coalesced into one check after this delay. */
const CHECK_DELAY_MS = 150;
/** While a prompt is in flight, the page is re-checked at least this often. */
const POLL_MS = 500;
/** A sent prompt that never produced a response is dropped after this long. */
const STALE_PROMPT_MS = 120_000;
/** Attribute changes that can flip a site's generating/streaming state. */
const WATCHED_ATTRIBUTES = [
  'class',
  'aria-label',
  'data-testid',
  'data-is-streaming',
  'is-streaming',
  'fonticon',
  'data-mat-icon-name',
];

const LOG_PREFIX = '[waister]';

/**
 * Finds the site adapter matching the current hostname (e.g. `chatgpt.com`, `claude.ai`, `gemini.google.com`).
 */
export function resolveSiteAdapter(
  host: string = window.location.hostname,
  adapters: readonly SiteAdapter[] = SUPPORTED_SITES,
): SiteAdapter | null {
  return adapters.find((adapter) => adapter.matches(host)) ?? null;
}

/**
 * Text currently typed into a composer element (textarea or contenteditable).
 */
function readDraftText(element: Element): string {
  const text = element instanceof HTMLTextAreaElement ? element.value : element.textContent;
  return (text ?? '').trim();
}

/**
 * Watches the page through `adapter` and calls `onCompleted` with `{ t0, tStreamStart, t1 }`
 * once per finished prompt/response cycle. Returns a cleanup function.
 */
export function observeTurns(
  adapter: SiteAdapter,
  onCompleted: (timings: TurnTimings) => void,
): () => void {
  /** Prompt send time, null while no prompt is in flight. */
  let t0: number | null = null;
  let tStreamStart: number | null = null;
  /** User prompt count before the current prompt. A higher count means a new prompt was sent. */
  let baselineUserCount = adapter.countUserMessages();
  /** Response count before the current prompt. A higher count means its response exists. */
  let baselineCount = adapter.countResponses();
  let lastText = '';
  /** Last time the response text changed or the site showed its generating indicator. */
  let lastActivity = 0;
  let sawGenerating = false;
  let timer: number | null = null;
  let timerDue = 0;

  const schedule = (delayMs: number) => {
    if (timer !== null) window.clearTimeout(timer);
    timerDue = Date.now() + delayMs;
    timer = window.setTimeout(check, delayMs);
  };

  const reset = () => {
    t0 = null;
    tStreamStart = null;
    lastText = '';
    sawGenerating = false;
    baselineUserCount = adapter.countUserMessages();
    baselineCount = adapter.countResponses();
  };

  const markPromptSent = () => {
    if (t0 !== null) return;
    t0 = Date.now();
    tStreamStart = null;
    lastText = '';
    lastActivity = t0;
    sawGenerating = false;
    baselineUserCount = adapter.countUserMessages();
    baselineCount = adapter.countResponses();
    schedule(CHECK_DELAY_MS);
  };

  const complete = (t1: number) => {
    if (t0 === null) return;
    const timings: TurnTimings = { t0, tStreamStart: tStreamStart ?? t1, t1 };
    reset();
    onCompleted(timings);
  };

  function check(): void {
    timer = null;
    const now = Date.now();
    const generating = adapter.isGenerating();
    const userCount = adapter.countUserMessages();
    const count = adapter.countResponses();

    if (t0 === null) {
      // A new user message appeared together with a generating state or without a matching new response yet
      const userPromptJustAppeared =
        userCount > baselineUserCount && (generating || count <= baselineCount);
      if (!generating && !userPromptJustAppeared) {
        // Idle (or navigating between chats): keep baselines in sync.
        baselineUserCount = userCount;
        baselineCount = count;
        return;
      }
      // The send event was missed, but a prompt was just sent.
      t0 = now;
      lastActivity = now;
      baselineUserCount = userCount;
    }

    const hasNewResponse = count > baselineCount;
    if (generating) {
      sawGenerating = true;
      lastActivity = now;
    }
    if (hasNewResponse) {
      const text = adapter.readResponse();
      if (text !== lastText) {
        lastText = text;
        lastActivity = now;
      }
      if (tStreamStart === null && adapter.isStreamingVisibleText()) {
        tStreamStart = now;
      }
    }

    if (!generating && hasNewResponse && lastText) {
      const quietMs = sawGenerating ? SETTLE_MS : TEXT_STABLE_MS;
      const waited = now - lastActivity;
      if (waited >= quietMs) {
        complete(lastActivity);
      } else {
        schedule(quietMs - waited);
      }
      return;
    }

    if (!generating && !hasNewResponse && now - t0 > STALE_PROMPT_MS) {
      reset();
      return;
    }

    schedule(POLL_MS);
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const target = event.target;
    if (target instanceof Element && adapter.isPromptInput(target) && readDraftText(target)) {
      markPromptSent();
    }
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (target instanceof Element && adapter.isSendButton(target)) {
      markPromptSent();
    }
  };

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('click', onClick, true);

  const observer = new MutationObserver(() => {
    if (timer === null || timerDue > Date.now() + CHECK_DELAY_MS) {
      schedule(CHECK_DELAY_MS);
    }
  });
  observer.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: WATCHED_ATTRIBUTES,
  });

  return () => {
    observer.disconnect();
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('click', onClick, true);
    if (timer !== null) window.clearTimeout(timer);
  };
}

/**
 * Consolidates the site adapter's DOM reads and timing markers (`t0`, `tStreamStart`, `t1`)
 * into a structured-clone-safe `ChatCaptureDto` once the response stream has finished.
 */
export function buildChatCaptureDto(adapter: SiteAdapter, timings: TurnTimings): ChatCaptureDto {
  // Delta between t(0) (user sent prompt) and start of visible stream -> thinking time
  const thinkingTimeMs = Math.max(0, timings.tStreamStart - timings.t0);
  // Delta between t(0) (user sent prompt) and t(1) (response stream finished) -> total latency
  const latencyMs = Math.max(0, timings.t1 - timings.t0);

  return {
    provider: adapter.provider,
    model: adapter.readModel(),
    userInput: adapter.readUserInput(),
    response: adapter.readResponse(),
    chatHistory: adapter.readHistory(),
    latencyMs,
    thinkingTimeMs,
    capturedAt: timings.t1,
  };
}

/**
 * Sends the consolidated `ChatCaptureDto` across the MV3 runtime boundary (`ESTIMATE_PROMPT`)
 * so that `message.handler.ts` routes it directly into `handleEstimation` in `estimation.handler.ts`.
 */
export function dispatchCaptureToEstimationHandler(dto: ChatCaptureDto): void {
  const message: EstimatePromptMessage = {
    type: 'ESTIMATE_PROMPT',
    payload: dto,
  };
  try {
    chrome.runtime.sendMessage(message).catch((err: unknown) => {
      console.warn(LOG_PREFIX, 'background did not answer', err);
    });
  } catch (err) {
    // Throws synchronously once the extension was reloaded: this tab needs a page reload.
    console.warn(LOG_PREFIX, 'extension was reloaded, reload this tab', err);
  }
}

/**
 * Starts the consolidated DOM capture strategy on the current page.
 * Watches the page through the matching site adapter, consolidates each finished turn into a
 * `ChatCaptureDto`, and dispatches it to `estimation.handler.ts`.
 */
export function startDomCaptureStrategy(
  onCapture: OnCaptureReady = dispatchCaptureToEstimationHandler,
  host: string = window.location.hostname,
  adapters: readonly SiteAdapter[] = SUPPORTED_SITES,
): () => void {
  const adapter = resolveSiteAdapter(host, adapters);
  if (!adapter) {
    return () => {};
  }
  console.info(LOG_PREFIX, `watching ${host} (${adapter.provider})`);

  return observeTurns(adapter, (timings) => {
    const dto = buildChatCaptureDto(adapter, timings);
    // Only dispatch when the finished turn actually has text
    if (!dto.response && !dto.userInput) {
      return;
    }
    console.info(LOG_PREFIX, 'captured prompt', dto);
    onCapture(dto);
  });
}

/**
 * Object facade implementing `ReaderStrategy` for consumers that expect the strategy contract.
 */
export const domCaptureStrategy: ReaderStrategy = {
  start: startDomCaptureStrategy,
};
