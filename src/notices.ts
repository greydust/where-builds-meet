export type NoticeMessage = string | (() => string);
export type Notice = {
  id: string;
  message: NoticeMessage;
  error?: boolean;
  action?: { label: NoticeMessage; run: () => void };
};

let notices: readonly Notice[] = [];
const subscribers = new Set<() => void>();

export function getNotices() {
  return notices;
}
export function subscribeToNotices(callback: () => void) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}
export function publishNotice(notice: Notice) {
  notices = [...notices.filter((entry) => entry.id !== notice.id), notice];
  for (const callback of subscribers) callback();
}
export function dismissNotice(id: string) {
  if (!notices.some((notice) => notice.id === id)) return;
  notices = notices.filter((notice) => notice.id !== id);
  for (const callback of subscribers) callback();
}
