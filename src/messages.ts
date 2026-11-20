/** Messages exchanged between the popup, content script and background worker. */
export type Message = { type: 'PING' } | { type: 'GET_PAGE_INFO' };

export type PageInfo = { title: string; url: string };
