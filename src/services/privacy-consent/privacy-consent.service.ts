/**
 * PrivacyConsentService: stores the user's answer to the privacy notice in IndexedDB.
 * Its own IndexedDB database, not a SQLite table: it is needed before (and without) any prompt,
 * and reading it must not load the SQLite WASM. No `storage` permission needed.
 *
 * Context: background
 * Docs: docs/modules.md#privacy-consent-service
 */

import { privacy } from '../../config/config.json';
import type { PrivacyConsentDto } from '../../dto/privacy-consent.dto';

const IDB_NAME = 'waister-settings';
const IDB_STORE = 'settings';
const CONSENT_KEY = 'privacyConsent';

/** An answer to an older policy version counts as no answer: the user has to decide again. */
export async function getPrivacyConsent(): Promise<PrivacyConsentDto> {
  const stored = await idbRequest<PrivacyConsentDto | undefined>('readonly', (store) =>
    store.get(CONSENT_KEY),
  );
  if (!stored || stored.policyVersion !== privacy.policyVersion) {
    return { status: 'unset', policyVersion: privacy.policyVersion, decidedAt: null };
  }
  return stored;
}

export async function setPrivacyConsent(accepted: boolean): Promise<PrivacyConsentDto> {
  const consent: PrivacyConsentDto = {
    status: accepted ? 'accepted' : 'declined',
    policyVersion: privacy.policyVersion,
    decidedAt: Date.now(),
  };
  await idbRequest('readwrite', (store) => store.put(consent, CONSENT_KEY));
  return consent;
}

export async function hasPrivacyConsent(): Promise<boolean> {
  return (await getPrivacyConsent()).status === 'accepted';
}

function idbRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(IDB_STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const connection = open.result;
      const transaction = connection.transaction(IDB_STORE, mode);
      const request = run(transaction.objectStore(IDB_STORE));
      let result: T;
      request.onsuccess = () => {
        result = request.result as T;
      };
      // Resolve on commit, so an answer is really on disk before the UI moves on.
      transaction.oncomplete = () => {
        connection.close();
        resolve(result);
      };
      transaction.onerror = () => {
        connection.close();
        reject(transaction.error);
      };
    };
  });
}
