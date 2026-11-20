# 0008: Turn detection in the strategy, not the site adapters

**Status:** Accepted (2026-11-20)

## Context

[ADR 0003](0003-dom-readers.md) splits reading into site adapters (WHERE) and strategies (WHEN),
but each site adapter had grown its own copy of the timing loop (`observeTurnCompletion`). The
three copies shared the same bugs, and on ChatGPT and Gemini no prompt was captured:

- The `MutationObserver` watched one container picked at page load. The chat apps are SPAs and
  replace that container on navigation, so the observer ended up watching a detached node.
- A turn only finished when the site's stop button disappeared. On Gemini that button was
  matched by its English `aria-label`, which doesn't exist in a localized UI (e.g. German).

## Decision

Move turn detection into `dom-capture.strategy.ts` (`observeTurns`), once for all sites. The site
adapter contract loses `getChatContainer()` and `observeTurnCompletion()` and gains plain DOM
checks: `countResponses()`, `isPromptInput(target)`, `isSendButton(target)`.

The loop observes `document.body` and treats a response as finished once `isGenerating()` is
false and the response text has stopped changing. If `isGenerating()` was never true during a
turn, a longer text-stability window (2.5 s) decides on its own.

## Consequences

- Site adapters are back to WHERE only, as ADR 0003 intended. A site redesign touches selectors,
  a timing fix touches one file.
- A broken stop-button selector no longer blocks capture. It only delays `t1` detection by ~2 s.
- Observing the whole body means more observer callbacks. They are coalesced into one check per
  150 ms, and attribute changes are filtered to the few attributes that signal streaming.
