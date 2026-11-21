/**
 * Header: the full Waister logo, centered at the top of the popup.
 *
 * Context: popup
 * Docs: docs/modules.md#ui
 */

/** public/logo/ is copied to the extension root, so this path works from popup/index.html. */
const LOGO_SRC = '/logo/waister-full.svg';

export function Header() {
  return (
    <header className="header">
      <img className="header-logo" src={LOGO_SRC} alt="Waister" />
    </header>
  );
}
