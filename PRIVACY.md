# Waister Privacy Policy

**Version:** 2026-11-24 · applies to Waister 1.0.0 and later

Waister is a browser extension that estimates the tokens, energy, water and CO2 of your prompts in
AI chat web apps. This policy explains what data the extension handles, and why. Short version:
**everything stays in your browser. Nothing is ever sent to us or to anyone else.**

## 1. Who is responsible

Waister is a university student project. The developers do not run any server for it and receive
no data from it. Questions or requests: please open an issue at
<https://github.com/julius-gmeinder/waister/issues>.

## 2. Consent first

When you install Waister it shows a privacy notice. Until you click **Accept and start**, the
extension does not read any chat page and saves nothing. If you decline, it stays inactive. You
can change your answer at any time under **Privacy** (the shield in the popup, or the Privacy
button in the app page's sidebar).

## 3. What the extension reads

Only on `chatgpt.com`, `claude.ai` and `gemini.google.com`, and only after you accepted:

- the text of the prompt you send, the assistant's answer and the earlier messages of the open
  chat (including whether images or files were attached, but not their content),
- the model name and thinking-effort label the page shows,
- how long the answer took.

The text is used **only in memory**, inside your browser, to count tokens. It is discarded right
after counting. It is never saved, logged or transmitted.

## 4. What the extension saves

For every prompt, Waister saves one record with **numbers only**:

- token counts (input, history, output, estimated thinking, tools, overhead, total),
- estimated energy (Wh), water (ml) and CO2 (g),
- chat app, model name/version/effort label, response times, date and time,
- the address of the chat (for example `https://claude.ai/chat/<id>`), so you can open it again
  from the History. The address contains no chat text.

It also saves your privacy answer (accepted/declined, policy version, date) and a few display
preferences.

All of it is stored **locally in your browser** (IndexedDB / localStorage of the extension). It is
not synced and not uploaded.

## 5. What the extension never does

- No data is sent to the developers or to third parties. The extension makes no network requests
  at all; fonts and icons are bundled.
- No account, no analytics, no tracking, no advertising, no cookies.
- No sale or transfer of data, and no use for creditworthiness, lending or any purpose other than
  showing you your own usage.

## 6. Legal basis (GDPR)

Reading the chat pages is based on your **consent** (Art. 6(1)(a) GDPR). You can withdraw it at
any time under **Privacy** ("Turn recording off"); this does not affect the lawfulness of what
was recorded before.

## 7. How long data is kept, and how to delete it

Saved records stay in your browser until you delete them. You can:

- delete all saved prompts under **Privacy** → "Delete all saved prompts", or in Analytics →
  reset history,
- export them as CSV or JSON from Analytics (the file is created locally),
- remove the extension, which deletes all of its data from the browser.

## 8. Your rights

Under the GDPR you have the right to access, rectification, erasure, restriction, data
portability and objection, and the right to lodge a complaint with a data protection supervisory
authority. Since all data is stored only on your device, you can exercise most of these yourself
with the controls above. The developers hold no data about you.

## 9. Permissions

- **Access to chatgpt.com, claude.ai, gemini.google.com:** to read the chat page as described in
  section 3.
- **unlimitedStorage:** so the browser does not evict your locally saved history.

## 10. Changes

If this policy changes, its version changes and the extension asks for your consent again before
reading any chat page.
