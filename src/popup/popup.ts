import type { Message, PageInfo } from '../messages';

const status = document.querySelector<HTMLParagraphElement>('#status')!;

async function main(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    status.textContent = 'No active tab.';
    return;
  }

  try {
    const message: Message = { type: 'GET_PAGE_INFO' };
    const info: PageInfo = await chrome.tabs.sendMessage(tab.id, message);
    status.textContent = `Current page: ${info.title}`;
  } catch {
    // Content scripts don't run on chrome:// pages, the Web Store, etc.
    status.textContent = 'Content script not available on this page.';
  }
}

void main();
