/**
 * PrivacyNotice: the privacy disclosure and consent (GDPR Art. 6(1)(a), Chrome Web Store
 * "prominent disclosure"). While the answer is `unset` it can't be dismissed: the user must
 * accept or decline. Afterwards it shows the current answer, lets the user change it and delete
 * all saved prompts. `dialog` = modal on the app page, `inline` = replaces the popup's content
 * (a modal doesn't fit the small popup window).
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

import { ExternalLink, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { privacy } from '../../config/config.json';
import type { PrivacyConsentDto } from '../../dto/privacy-consent.dto';
import { formatDateTime } from '../format.helpers';

interface PrivacyNoticeProps {
  consent: PrivacyConsentDto;
  variant: 'dialog' | 'inline';
  /** Only used by the dialog: whether it is shown. An `unset` answer always shows it. */
  open?: boolean;
  onDecide: (accepted: boolean) => Promise<boolean>;
  /** Closes the notice. Not offered while the answer is `unset`. */
  onClose: () => void;
  /** Deletes every saved prompt. Resolves `true` on success. */
  onDeleteData: () => Promise<boolean>;
}

function Disclosure() {
  return (
    <>
      <p className="privacy-notice-lead">
        Waister estimates the tokens, energy, water and CO2 of your prompts on ChatGPT, Claude and
        Gemini. To do that it has to read those chat pages, so it asks first.
      </p>
      <dl className="privacy-notice-facts">
        <div className="privacy-notice-fact">
          <dt>What is read</dt>
          <dd>
            Only on chatgpt.com, claude.ai and gemini.google.com: the text of your prompt, the
            answer and the earlier messages of the open chat, the model name and the response time.
            The text is used only to count tokens and is discarded right away.
          </dd>
        </div>
        <div className="privacy-notice-fact">
          <dt>What is saved</dt>
          <dd>
            Numbers only: token counts, estimated energy, water and CO2, the model, timings and the
            address of the chat. Never the text of your chats.
          </dd>
        </div>
        <div className="privacy-notice-fact">
          <dt>Where it goes</dt>
          <dd>
            Nowhere. Everything stays in this browser. Nothing is sent to us or to anyone else: no
            account, no analytics, no tracking, no ads.
          </dd>
        </div>
        <div className="privacy-notice-fact">
          <dt>Your control</dt>
          <dd>
            You can change your answer any time under Privacy and delete all saved prompts. Removing
            the extension deletes everything.
          </dd>
        </div>
      </dl>
      <p className="privacy-notice-legal">
        Legal basis: your consent (Art. 6(1)(a) GDPR). You can withdraw it at any time; this does
        not affect what was recorded before.{' '}
        <a href={privacy.policyUrl} target="_blank" rel="noreferrer">
          Full privacy policy
          <ExternalLink aria-hidden="true" />
        </a>
      </p>
    </>
  );
}

function statusText(consent: PrivacyConsentDto): string {
  const since = consent.decidedAt === null ? '' : ` since ${formatDateTime(consent.decidedAt)}`;
  return consent.status === 'accepted'
    ? `Recording is on${since}.`
    : `Recording is off${since}. Nothing is read or saved.`;
}

function NoticeBody({
  consent,
  onDecide,
  onClose,
  onDeleteData,
  titleId,
  closeRef,
}: Omit<PrivacyNoticeProps, 'variant' | 'open'> & {
  titleId: string;
  closeRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const undecided = consent.status === 'unset';

  const decide = async (accepted: boolean) => {
    setBusy(true);
    const ok = await onDecide(accepted);
    setBusy(false);
    if (!ok) {
      setNote('Could not save your answer. Please try again.');
      return;
    }
    // Content scripts read the answer once per page load.
    setNote(
      accepted
        ? 'Recording is on. Reload chat tabs that were already open.'
        : 'Recording is off. Reload chat tabs that were already open.',
    );
  };

  const deleteData = async () => {
    setBusy(true);
    const ok = await onDeleteData();
    setBusy(false);
    setConfirmDelete(false);
    setNote(ok ? 'All saved prompts were deleted.' : 'Could not delete the saved prompts.');
  };

  let actions: ReactNode;
  if (undecided) {
    actions = (
      <>
        <button
          type="button"
          className="privacy-notice-btn privacy-notice-btn--primary"
          disabled={busy}
          onClick={() => void decide(true)}
        >
          Accept and start
        </button>
        <button
          type="button"
          className="privacy-notice-btn"
          disabled={busy}
          onClick={() => void decide(false)}
        >
          Decline
        </button>
      </>
    );
  } else {
    actions = (
      <>
        {consent.status === 'accepted' ? (
          <button
            type="button"
            className="privacy-notice-btn"
            disabled={busy}
            onClick={() => void decide(false)}
          >
            Turn recording off
          </button>
        ) : (
          <button
            type="button"
            className="privacy-notice-btn privacy-notice-btn--primary"
            disabled={busy}
            onClick={() => void decide(true)}
          >
            Accept and turn recording on
          </button>
        )}
        {confirmDelete ? (
          <>
            <button
              type="button"
              className="privacy-notice-btn privacy-notice-btn--danger"
              disabled={busy}
              onClick={() => void deleteData()}
            >
              Yes, delete everything
            </button>
            <button
              type="button"
              className="privacy-notice-btn"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="privacy-notice-btn"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 aria-hidden="true" />
            Delete all saved prompts
          </button>
        )}
      </>
    );
  }

  return (
    <div className="privacy-notice-body">
      <header className="privacy-notice-header">
        <h2 id={titleId} className="privacy-notice-title">
          <ShieldCheck aria-hidden="true" />
          Your privacy
        </h2>
        {!undecided && (
          <button
            ref={closeRef}
            type="button"
            className="privacy-notice-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </button>
        )}
      </header>
      <Disclosure />
      {!undecided && <p className="privacy-notice-status">{statusText(consent)}</p>}
      <div className="privacy-notice-actions">{actions}</div>
      {note && (
        <p className="privacy-notice-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}

export function PrivacyNotice({ variant, open = false, ...props }: PrivacyNoticeProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const undecided = props.consent.status === 'unset';
  const shown = undecided || open;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (shown && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!shown && dialog.open) {
      dialog.close();
    }
  }, [shown]);

  if (variant === 'inline') {
    return (
      <section className="privacy-notice privacy-notice--inline" aria-labelledby="privacy-title">
        <NoticeBody {...props} titleId="privacy-title" />
      </section>
    );
  }

  // Escape must not dismiss an unanswered notice: there is no implicit answer. `closedby="none"`
  // blocks it where supported; Chrome ignores preventDefault on `cancel` before the first user
  // click, so a dialog that closes anyway while unanswered is reopened.
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape' && undecided) event.preventDefault();
  };
  const onDialogClose = () => {
    if (undecided) dialogRef.current?.showModal();
    else props.onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="privacy-notice privacy-notice--dialog"
      aria-labelledby="privacy-title"
      closedby={undecided ? 'none' : 'any'}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        if (undecided) event.preventDefault();
      }}
      onClose={onDialogClose}
    >
      {shown && <NoticeBody {...props} titleId="privacy-title" closeRef={closeRef} />}
    </dialog>
  );
}
