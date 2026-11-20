# 0002: Reader in content script, estimation in background

**Status:** Accepted (2026-11-20)

## Context

Only content scripts can see the chat page's DOM. Tokenizers ship large vocabularies (and maybe
WASM). Content scripts run once per open tab, while the background runs once per browser.

## Decision

The reader runs in the content script and sends a plain `ChatCaptureDto` by
`chrome.runtime` message. The EstimationHandler and all services run in the background (MV3
service worker).

## Consequences

- Tokenizers load once, not in every tab, and content scripts stay small.
- The DTO must be structured-clone safe.
- The service worker can be stopped when idle, so state that has to outlive it (the latest
  estimate for the popup) goes into `chrome.storage.session`.
- Rejected alternative: an offscreen document for estimation. It adds moving parts and can be
  revisited if a tokenizer needs a DOM or a Worker.
