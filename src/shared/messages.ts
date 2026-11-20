/** Messages exchanged between the popup, content script and background worker. */
export type Message =
  | { type: 'PING' }
  | { type: 'GET_PAGE_INFO' }
  | { type: 'KV_GET'; key: string }
  | { type: 'KV_SET'; key: string; value: string };

export type PageInfo = { title: string; url: string };
