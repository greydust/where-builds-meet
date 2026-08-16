export type UiIconName =
  "active" | "chevronDown" | "chevronRight" | "close" | "edit" | "plus" | "reset" | "up" | "down";

export function UiIcon({ name }: { name: UiIconName }) {
  if (name === "active")
    return (
      <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
      </svg>
    );
  if (name === "chevronDown")
    return (
      <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    );
  if (name === "chevronRight")
    return (
      <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    );
  if (name === "close")
    return (
      <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    );
  if (name === "edit")
    return (
      <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Zm10-12 3 3" />
      </svg>
    );
  if (name === "plus")
    return (
      <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  if (name === "reset")
    return (
      <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 8V4m0 0h4M5 4l3 3a7 7 0 1 1-2 7" />
      </svg>
    );
  if (name === "up")
    return (
      <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 14 6-6 6 6" />
      </svg>
    );
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 10 6 6 6-6" />
    </svg>
  );
}
