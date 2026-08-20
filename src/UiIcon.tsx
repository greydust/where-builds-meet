export type UiIconName =
  "active" | "arrowUp" | "chevronDown" | "chevronRight" | "close" | "edit" | "plus" | "reset" | "trash" | "up" | "down";

export function UiIcon({ name }: { name: UiIconName }) {
  let content;
  switch (name) {
    case "active":
      content = <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />;
      break;
    case "arrowUp":
      content = <path d="M12 19V5M6 11l6-6 6 6" />;
      break;
    case "chevronDown":
      content = <path d="m6 9 6 6 6-6" />;
      break;
    case "chevronRight":
      content = <path d="m9 6 6 6-6 6" />;
      break;
    case "close":
      content = <path d="M6 6l12 12M18 6 6 18" />;
      break;
    case "edit":
      content = <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Zm10-12 3 3" />;
      break;
    case "plus":
      content = <path d="M12 5v14M5 12h14" />;
      break;
    case "reset":
      content = <path d="M5 8V4m0 0h4M5 4l3 3a7 7 0 1 1-2 7" />;
      break;
    case "trash":
      content = <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />;
      break;
    case "up":
      content = <path d="m6 14 6-6 6 6" />;
      break;
    case "down":
      content = <path d="m6 10 6 6 6-6" />;
      break;
  }
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
      {content}
    </svg>
  );
}
