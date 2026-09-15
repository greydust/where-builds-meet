// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "../src/ui/Modal";

// jsdom does not implement HTMLDialogElement.showModal/close; stub the missing
// methods with matching open semantics so the effect under test can run.
function stubDialogMethods() {
  HTMLDialogElement.prototype.showModal = vi.fn<(this: HTMLDialogElement) => void>(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn<(this: HTMLDialogElement) => void>(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
}

describe("Modal", () => {
  let container: HTMLDivElement;
  let root: Root;

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    stubDialogMethods();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it("renders children with the accessible label", async () => {
    await act(async () => {
      root.render(
        <Modal open onClose={vi.fn<() => void>()} label="Example dialog">
          <button>Confirm</button>
        </Modal>,
      );
    });

    const dialog = container.querySelector("dialog");
    expect(dialog?.getAttribute("aria-label")).toBe("Example dialog");
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.querySelector("button")?.textContent).toBe("Confirm");
  });

  it("reports closing through onClose", async () => {
    const onClose = vi.fn<() => void>();
    await act(async () => {
      root.render(
        <Modal open onClose={onClose} label="Example dialog">
          <button>Confirm</button>
        </Modal>,
      );
    });

    const dialog = container.querySelector("dialog");
    await act(async () => {
      dialog?.dispatchEvent(new Event("close"));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
