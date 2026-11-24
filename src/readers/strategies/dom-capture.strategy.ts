/**
 * DomCaptureStrategy: one shared turn-detection loop on top of all site adapters, sending a
 * `ChatCaptureDto` per finished prompt to the background (`ESTIMATE_PROMPT`).
 * Watches the whole document because chat apps are SPAs that replace their containers on
 * navigation. If a site's "generating" indicator never shows (e.g. its selector doesn't match a
 * localized UI), a longer text-stability window decides on its own.
 *
 * Context: content
 * Docs: docs/modules.md#reader-strategies
 */

import { capture } from '../../config/config.json';
import type { ChatCaptureDto } from '../../dto/chat-capture.dto';
import type { EstimatePromptMessage } from '../../messages/runtime-messages';
import { chatgptSite } from '../sites/chatgpt.site';
import { claudeSite } from '../sites/claude.site';
import { geminiSite } from '../sites/gemini.site';
import type { SiteAdapter } from '../sites/site-adapter.types';
import type { OnCaptureReady, TurnTimings } from './reader-strategy.types';

const { settleMs, textStableMs, checkDelayMs, pollMs, stalePromptMs } = capture.timings;

const LOG_PREFIX = '[waister]';

const SUPPORTED_SITES: readonly SiteAdapter[] = [chatgptSite, claudeSite, geminiSite];

/**
 * Attribute changes that can flip a site's generating/streaming state. Without the filter every
 * attribute write on the page would wake the observer.
 */
const WATCHED_ATTRIBUTES = [
  'class', // ChatGPT `.result-streaming`, Gemini `.send-button.stop`
  'aria-label', // send / stop buttons (all sites)
  'data-testid', // ChatGPT send-button <-> stop-button
  'data-is-streaming', // Claude streaming container
  'data-message-complete', // ChatGPT: set once a message finished
  'data-message-streaming', // ChatGPT: set while a message streams
  'data-stop-generating', // ChatGPT: composer button in stop state
  'data-response-starting', // ChatGPT: "Thinking…" placeholder before visible text
  'data-d-streaming-reveal', // ChatGPT: text being revealed while streaming
  'data-talvt-turn-state', // turn state flag (no adapter selector uses it, it only triggers a check)
  'is-streaming', // Gemini `model-response[is-streaming]`
  'fonticon', // Gemini stop icon on the send button
  'data-mat-icon-name', // Gemini stop icon (Material icon variant)
];

/** Starts watching the page if the site is supported. Returns a cleanup function. */
export function startDomCaptureStrategy(
  onCapture: OnCaptureReady = dispatchCaptureToEstimationHandler,
): () => void {
  const host = window.location.hostname;
  const adapter = resolveSiteAdapter(host);
  if (!adapter) {
    return () => {};
  }
  console.info(LOG_PREFIX, `watching ${host} (${adapter.provider})`);

  return observeTurns(adapter, (timings) => {
    const dto = buildChatCaptureDto(adapter, timings);
    if (!dto.response && !dto.userInput && !dto.artifactText) {
      console.info(LOG_PREFIX, 'capture dropped: prompt and response text are empty');
      return;
    }
    // No DTO in the log: it holds the chat text, and the page's console is not ours.
    console.info(LOG_PREFIX, 'captured prompt', {
      provider: dto.provider,
      latencyMs: dto.latencyMs,
    });
    onCapture(dto);
  });
}

function resolveSiteAdapter(host: string): SiteAdapter | null {
  return SUPPORTED_SITES.find((adapter) => adapter.matches(host)) ?? null;
}

/**
 * Calls `onCompleted` once per finished prompt/response cycle. Returns a cleanup function.
 *
 * Lifecycle of one prompt (all epoch ms):
 * - `t0` is null while idle. It is set when the send is seen (Enter / send button), or, if that
 *   event was missed, when `check` sees a generating indicator or a new user message.
 * - `tStreamStart` is set by the first `check` where the adapter reports visible response text.
 *   It stays null for responses that never show a thinking phase.
 * - `t1` is `lastActivity` (last text change or generating indicator), not "now": the settle
 *   wait below is detection overhead and must not count as latency.
 *
 * A response is done once the indicator is gone and the text was quiet for `quietMs`. The window
 * is short (`settleMs`) if the indicator was seen, because its disappearance is the real signal.
 * If it never showed, only text stability can tell, so the longer `textStableMs` applies.
 */
function observeTurns(
  adapter: SiteAdapter,
  onCompleted: (timings: TurnTimings) => void,
): () => void {
  let t0: number | null = null;
  let tStreamStart: number | null = null;
  /** Counts before the current prompt: a higher count means a new prompt / its response exists. */
  let baselineUserCount = adapter.countUserMessages();
  let baselineCount = adapter.countResponses();
  let lastText = '';
  /** Last time the response text changed or the site showed its generating indicator. */
  let lastActivity = 0;
  let sawGenerating = false;

  const timer = createDebouncedTimer(() => check());
  const logState = createStateLogger();

  const reset = () => {
    t0 = null;
    tStreamStart = null;
    lastText = '';
    lastActivity = 0;
    sawGenerating = false;
    baselineUserCount = adapter.countUserMessages();
    baselineCount = adapter.countResponses();
    logState.reset();
  };

  const markPromptSent = (source: 'enter' | 'click') => {
    if (t0 !== null) return;
    console.info(LOG_PREFIX, `prompt sent (${source})`);
    reset();
    t0 = Date.now();
    lastActivity = t0;
    timer.schedule(checkDelayMs);
  };

  const complete = (t1: number) => {
    if (t0 === null) return;
    const timings: TurnTimings = { t0, tStreamStart: tStreamStart ?? t1, t1 };
    reset();
    onCompleted(timings);
  };

  const check = () => {
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
      // The send event was missed, but a prompt was just sent. Only the user baseline moves up:
      // the response may already be streaming and must still count as new against `baselineCount`.
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
    logState({
      generating,
      userCount,
      baselineUserCount,
      count,
      baselineCount,
      responseChars: lastText.length,
      visibleText: tStreamStart !== null,
    });

    if (!generating && hasNewResponse && lastText) {
      const quietMs = sawGenerating ? settleMs : textStableMs;
      const waited = now - lastActivity;
      if (waited >= quietMs) {
        complete(lastActivity);
      } else {
        timer.schedule(quietMs - waited);
      }
      return;
    }

    if (!generating && !hasNewResponse && now - t0 > stalePromptMs) {
      console.info(LOG_PREFIX, 'prompt dropped: no response appeared');
      reset();
      return;
    }

    timer.schedule(pollMs);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    if (targetMatches(event, (el) => adapter.isPromptInput(el) && readDraftText(el) !== '')) {
      markPromptSent('enter');
    }
  };

  const onClick = (event: MouseEvent) => {
    if (targetMatches(event, (el) => adapter.isSendButton(el))) {
      markPromptSent('click');
    }
  };

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('click', onClick, true);

  // Fires on every mutation while a response streams, so the callback only (re)schedules a check.
  const observer = new MutationObserver(() => timer.scheduleIfSooner(checkDelayMs));
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
    timer.cancel();
  };
}

/** One pending timeout that a new `schedule` replaces. */
function createDebouncedTimer(fn: () => void) {
  let handle: number | null = null;
  let dueAt = 0;

  const cancel = () => {
    if (handle !== null) window.clearTimeout(handle);
    handle = null;
  };

  const schedule = (delayMs: number) => {
    cancel();
    dueAt = Date.now() + delayMs;
    handle = window.setTimeout(() => {
      handle = null;
      fn();
    }, delayMs);
  };

  return {
    schedule,
    /** Keeps an already pending timer that fires within `delayMs`, otherwise (re)schedules. */
    scheduleIfSooner(delayMs: number) {
      if (handle === null || dueAt > Date.now() + delayMs) schedule(delayMs);
    },
    cancel,
  };
}

interface DetectionState {
  generating: boolean;
  userCount: number;
  baselineUserCount: number;
  count: number;
  baselineCount: number;
  responseChars: number;
  visibleText: boolean;
}

/** Logs detection state on change, so a stuck capture is debuggable from the page console. */
function createStateLogger() {
  let lastLogged = '';

  const log = (s: DetectionState) => {
    const state =
      `generating=${s.generating} users=${s.userCount}/${s.baselineUserCount} ` +
      `responses=${s.count}/${s.baselineCount} responseChars=${s.responseChars} ` +
      `visibleText=${s.visibleText}`;
    if (state === lastLogged) return;
    lastLogged = state;
    console.info(LOG_PREFIX, 'state', state);
  };
  log.reset = () => {
    lastLogged = '';
  };
  return log;
}

/** True if the event target is an element accepted by `test` (guards the non-Element targets). */
function targetMatches(event: Event, test: (target: Element) => boolean): boolean {
  return event.target instanceof Element && test(event.target);
}

/** Works for both textarea and contenteditable composers. */
function readDraftText(element: Element): string {
  const text = element instanceof HTMLTextAreaElement ? element.value : element.textContent;
  return (text ?? '').trim();
}

function buildChatCaptureDto(adapter: SiteAdapter, timings: TurnTimings): ChatCaptureDto {
  const defaultThinkingMs = Math.max(0, timings.tStreamStart - timings.t0);
  const thinkingTimeMs = Math.max(
    0,
    adapter.consumeThinkingTimeMs?.(timings.t0, timings.tStreamStart, timings.t1) ??
      defaultThinkingMs,
  );
  const latencyMs = Math.max(0, timings.t1 - timings.t0);

  return {
    provider: adapter.provider,
    model: adapter.readModel(),
    userInput: adapter.readUserInput(),
    userAttachments: adapter.readUserAttachments(),
    response: adapter.readResponse(),
    artifactText: adapter.readArtifactText(),
    toolCalls: adapter.readToolCalls(),
    chatHistory: adapter.readHistory(),
    latencyMs,
    thinkingTimeMs,
    capturedAt: timings.t1,
    // Read at t1: a new chat gets its final URL (e.g. /c/<id>) once the first answer exists.
    conversationUrl: window.location.origin + window.location.pathname,
  };
}

function dispatchCaptureToEstimationHandler(dto: ChatCaptureDto): void {
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
