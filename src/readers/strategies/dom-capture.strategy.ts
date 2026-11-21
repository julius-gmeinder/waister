/**
 * DOM capture strategy: one shared turn-detection loop on top of all site adapters, sending a
 * `ChatCaptureDto` per finished prompt to the background (`ESTIMATE_PROMPT`).
 *
 * Watches the whole document because chat apps are SPAs that replace their containers on
 * navigation. A response is finished once the site's "generating" indicator is gone and the text
 * has stopped changing. If the indicator was never seen (e.g. its selector doesn't match a
 * localized UI), a longer text-stability window decides on its own.
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
  'data-message-complete',
  'is-streaming',
  'fonticon',
  'data-mat-icon-name',
];

const LOG_PREFIX = '[waister]';

export function resolveSiteAdapter(
  host: string = window.location.hostname,
  adapters: readonly SiteAdapter[] = SUPPORTED_SITES,
): SiteAdapter | null {
  return adapters.find((adapter) => adapter.matches(host)) ?? null;
}

/** Works for both textarea and contenteditable composers. */
function readDraftText(element: Element): string {
  const text = element instanceof HTMLTextAreaElement ? element.value : element.textContent;
  return (text ?? '').trim();
}

/** Calls `onCompleted` once per finished prompt/response cycle. Returns a cleanup function. */
export function observeTurns(
  adapter: SiteAdapter,
  onCompleted: (timings: TurnTimings) => void,
): () => void {
  /** Null while no prompt is in flight. */
  let t0: number | null = null;
  let tStreamStart: number | null = null;
  /** Counts before the current prompt: a higher count means a new prompt / its response exists. */
  let baselineUserCount = adapter.countUserMessages();
  let baselineCount = adapter.countResponses();
  let lastText = '';
  /** Last time the response text changed or the site showed its generating indicator. */
  let lastActivity = 0;
  let sawGenerating = false;
  let timer: number | null = null;
  let timerDue = 0;
  let lastLoggedState = '';

  /** Logs detection state on change, so a stuck capture is debuggable from the page console. */
  const logState = (generating: boolean, userCount: number, count: number) => {
    const state =
      `generating=${generating} users=${userCount}/${baselineUserCount} ` +
      `responses=${count}/${baselineCount} responseChars=${lastText.length} ` +
      `visibleText=${tStreamStart !== null}`;
    if (state === lastLoggedState) return;
    lastLoggedState = state;
    console.info(LOG_PREFIX, 'state', state);
  };

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
    lastLoggedState = '';
    baselineUserCount = adapter.countUserMessages();
    baselineCount = adapter.countResponses();
  };

  const markPromptSent = (source: 'enter' | 'click') => {
    if (t0 !== null) return;
    console.info(LOG_PREFIX, `prompt sent (${source})`);
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
      const userPromptJustAppeared =
        userCount > baselineUserCount && (generating || count <= baselineCount);
      if (!generating && !userPromptJustAppeared) {
        // Idle (or navigating between chats): keep baselines in sync.
        baselineUserCount = userCount;
        baselineCount = count;
        return;
      }
      // The send event was missed, but a prompt was just sent.
      console.info(LOG_PREFIX, 'prompt sent (detected from the page)');
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
    logState(generating, userCount, count);

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
      console.info(LOG_PREFIX, 'prompt dropped: no response appeared');
      reset();
      return;
    }

    schedule(POLL_MS);
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const target = event.target;
    if (target instanceof Element && adapter.isPromptInput(target) && readDraftText(target)) {
      markPromptSent('enter');
    }
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (target instanceof Element && adapter.isSendButton(target)) {
      markPromptSent('click');
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

export function buildChatCaptureDto(adapter: SiteAdapter, timings: TurnTimings): ChatCaptureDto {
  const thinkingTimeMs = Math.max(0, timings.tStreamStart - timings.t0);
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
    // Read at t1: a new chat gets its final URL (e.g. /c/<id>) once the first answer exists.
    conversationUrl: window.location.origin + window.location.pathname,
  };
}

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
    if (!dto.response && !dto.userInput) {
      console.info(LOG_PREFIX, 'capture dropped: prompt and response text are empty', dto);
      return;
    }
    console.info(LOG_PREFIX, 'captured prompt', dto);
    onCapture(dto);
  });
}

export const domCaptureStrategy: ReaderStrategy = {
  start: startDomCaptureStrategy,
};
