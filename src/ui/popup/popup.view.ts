/**
 * Popup view: asks the background for the active tab's latest estimate (GET_LATEST_ESTIMATE)
 * and renders totalTokens (and its breakdown).
 *
 * Icons: lucide. popup.html holds `<i data-lucide="name">` placeholders and renderIcons() swaps
 * them for inline SVGs. Only icons listed in POPUP_ICONS are bundled.
 *
 * Context: popup
 * Docs: docs/modules.md#popup
 */
import {
  Brain,
  Coins,
  Cpu,
  createIcons,
  History,
  MessageSquare,
  MessageSquareText,
  Settings2,
  Timer,
} from 'lucide';

/**
 * Every icon the popup uses. Add an icon here and use its kebab-case name in popup.html
 * (`MessageSquareText` → `data-lucide="message-square-text"`). Names missing here render nothing.
 */
const POPUP_ICONS = {
  Brain,
  Coins,
  Cpu,
  History,
  MessageSquare,
  MessageSquareText,
  Settings2,
  Timer,
};

function renderIcons(): void {
  createIcons({ icons: POPUP_ICONS, attrs: { 'stroke-width': 2 } });
}

/** Called by entries/popup.entry.ts once the popup document is ready. */
export function initPopupView(): void {
  renderIcons();
  // TODO: GET_LATEST_ESTIMATE → fill the [data-field] elements.
}
