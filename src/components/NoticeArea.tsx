import { Component, useSyncExternalStore, type ReactNode } from "react";
import { isDeploymentImportError } from "../deploymentUpdates";
import { dismissNotice, getNotices, subscribeToNotices, type NoticeMessage } from "../notices";
import { UiIcon } from "../UiIcon";
import { t } from "../i18n";

function noticeText(message: NoticeMessage) {
  return typeof message === "string" ? message : message();
}

export function NoticeArea() {
  const notices = useSyncExternalStore(subscribeToNotices, getNotices);
  return (
    <aside className="notice-area" aria-label={t("ui.notices.title")} aria-live="polite" aria-relevant="additions text">
      {notices.length > 0 && (
        <div className="notice-area-panel">
          <h2>{t("ui.notices.title")}</h2>
          <ul>
            {notices.map((notice) => (
              <li className={notice.error ? "notice-item notice-item-error" : "notice-item"} key={notice.id}>
                <div>
                  {notice.error && <strong>{t("ui.notices.error")}</strong>}
                  <p>{noticeText(notice.message)}</p>
                  {notice.action && (
                    <button type="button" className="button button-primary" onClick={notice.action.run}>
                      {noticeText(notice.action.label)}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("ui.notices.dismiss")}
                  onClick={() => dismissNotice(notice.id)}
                >
                  <UiIcon name="close" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

export class FeatureLoadBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: undefined as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) {
      if (!isDeploymentImportError(this.state.error)) throw this.state.error;
      return <p role="alert">{t("ui.deployment.featureUnavailable")}</p>;
    }
    return this.props.children;
  }
}
