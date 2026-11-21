/**
 * Header: the full Waister logo, centered.
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

/** public/ is copied to the extension root, so this absolute path works from every page. */
const LOGO_SRC = '/logo/waister-full.svg';

export function Header() {
  return (
    <header className="header">
      <img className="header-logo" src={LOGO_SRC} alt="Waister" />
    </header>
  );
}
