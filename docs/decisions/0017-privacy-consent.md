# 0017: Ask for privacy consent before reading any chat page

**Status:** Accepted (2026-11-24)

## Context

The content script reads the full text of prompts, answers and chat history to count tokens.
Only metrics are saved and nothing leaves the browser, but reading the text is still processing
personal data (GDPR) and "website content" in the Chrome Web Store's user-data policy, which asks
for a prominent disclosure and consent before such data is handled.

## Decision

- A **privacy notice** (`ui/components/privacy-notice.component.tsx`) explains what is read, what
  is saved, that nothing is transmitted, and links `PRIVACY.md`. Until it is answered it can't be
  dismissed (no Escape, no close button). Accept and Decline look the same, so neither is nudged.
- On first install `background.entry.ts` opens the app page, which shows the notice as a modal.
  The popup shows it inline instead of the tiles while unanswered. Both reopen it later (shield
  button in the popup, Privacy button in the Sidebar) to change the answer or delete all data.
- The answer is a `PrivacyConsentDto`, stored by a new background service
  (`services/privacy-consent/`) in its own IndexedDB database `waister-settings`, not in SQLite,
  so reading it never loads the WASM, and no `storage` permission is needed.
- It is enforced twice: `content.entry.ts` starts the capture strategy only when the answer is
  `accepted`, and `estimation.handler.ts` refuses to save without it (covers tabs opened before
  a withdrawal).
- `config.json` → `privacy.policyVersion` versions the answer. A new version makes every stored
  answer `unset`, so the user is asked again. `privacy.policyUrl` is the linked policy.

## Consequences

- Two new messages: `GET_PRIVACY_CONSENT`, `SET_PRIVACY_CONSENT`. `ESTIMATE_PROMPT` may now answer
  `null`.
- A changed answer applies to already open chat tabs after a reload (the content script reads it
  once per page load). The notice says so.
- Bump `privacy.policyVersion` together with `PRIVACY.md` whenever what is read or saved changes.
