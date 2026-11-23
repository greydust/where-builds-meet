import { IconX } from "@tabler/icons-react"
import { useSyncExternalStore } from "react"

import { t } from "@/i18n"
import { dismissNotice, getNotices, subscribeToNotices, type NoticeMessage } from "@/notices"
import { Button } from "@/ui/Button"

function noticeText(message: NoticeMessage) {
  return typeof message === "function" ? message() : message
}

export function NoticeArea() {
  const notices = useSyncExternalStore(subscribeToNotices, getNotices)
  return (
    <aside className="notice-area" aria-label={t("ui.notices.title")} aria-live="polite" aria-relevant="additions text">
      {notices.length > 0 && (
        <div className="notice-area-panel">
          <h2>{t("ui.notices.title")}</h2>
          <ul>
            {notices.map(notice => (
              <li className={notice.error ? "notice-item notice-item-error" : "notice-item"} key={notice.id}>
                <div>
                  {notice.error && <strong>{t("ui.notices.error")}</strong>}
                  <p>{noticeText(notice.message)}</p>
                  {notice.action && (
                    <Button type="button" variant="primary" onClick={notice.action.run}>
                      {noticeText(notice.action.label)}
                    </Button>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("ui.notices.dismiss")}
                  onClick={() => dismissNotice(notice.id)}
                >
                  <IconX size="1em" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
