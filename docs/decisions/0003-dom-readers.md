# 0003: DOM reading with site adapters + swappable strategies

**Status:** Accepted (2026-11-20)

## Context

The data can come from the rendered DOM or from intercepting the site's `fetch` streams. Hooking
the network is more exact (exact model id, full output) but more fragile, and it needs a
`MAIN`-world script plus a `postMessage` bridge.

## Decision

Read the DOM. Split reading into two layers:

- **Site adapters** (`readers/sites/`): WHERE. Selectors and plain reads for one site.
- **Reader strategies** (`readers/strategies/`): WHEN. Detect prompt sent and response finished.

## Consequences

- A site redesign only touches one adapter. A new timing approach is one new strategy.
- A network-hook reader can be added later as another strategy without changing the rest of the
  pipeline, because it produces the same `ChatCaptureDto`.
- Model version and thinking effort are only as accurate as the site's UI shows them, so
  `ModelInfo` has `unknown` values and a `rawLabel`.

## Update 2026-11-21

The swappable-strategy part was simplified. The `ReaderStrategy` interface and the
`chat.reader.ts` facade are gone, because there is only one strategy. `dom-capture.strategy.ts`
exports just `startDomCaptureStrategy(onCapture?)`, and `content.entry.ts` calls it directly. A
second strategy (e.g. a network hook) would bring an interface back when it is needed.
