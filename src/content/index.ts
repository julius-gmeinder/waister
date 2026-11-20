import type { Message, PageInfo } from '../shared/messages';

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_INFO') {
    const info: PageInfo = { title: document.title, url: location.href };
    sendResponse(info);
  }
  return false;
});
