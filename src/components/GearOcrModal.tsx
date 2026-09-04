import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent,
} from "react";
import { Modal } from "../ui/Modal";
import { gearData } from "../gear";
import type { GearOcrResult } from "../gearOcr";
import { t } from "../i18n";

type GearOcrModule = typeof import("../gearOcr");

let gearOcrModulePromise: Promise<GearOcrModule> | undefined;

function loadGearOcrModule() {
  if (!gearOcrModulePromise) {
    gearOcrModulePromise = import("../gearOcr").catch((error) => {
      gearOcrModulePromise = undefined;
      throw error;
    });
  }
  return gearOcrModulePromise;
}

type GearOcrModalProps = {
  open: boolean;
  definitionId: string;
  definitionName: string;
  onClose: () => void;
  onImport: (result: GearOcrResult) => void;
};

export function GearOcrModal({ open, definitionId, definitionName, onClose, onImport }: GearOcrModalProps) {
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrDragging, setOcrDragging] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrPreview, setOcrPreview] = useState("");

  useEffect(() => {
    if (!open) return;
    void loadGearOcrModule().catch(() => undefined);
    setOcrPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    if (ocrInputRef.current) ocrInputRef.current.value = "";
    setOcrError("");
    setOcrStatus("");
    setOcrProgress(0);
    setOcrDragging(false);
  }, [open]);

  useEffect(
    () => () => {
      if (ocrPreview) URL.revokeObjectURL(ocrPreview);
    },
    [ocrPreview],
  );

  const closeOcr = () => {
    if (!ocrBusy) onClose();
  };
  const importImage = async (file?: File) => {
    if (!file || ocrBusy) return;
    if (file.size > 15 * 1024 * 1024) {
      setOcrError(t("ui.buildTab.imageTooLargeError"));
      return;
    }
    setOcrError("");
    setOcrBusy(true);
    setOcrStatus(t("ui.buildTab.loadingOcrModel"));
    setOcrProgress(0);
    setOcrPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    try {
      const { recognizeGearImage } = await loadGearOcrModule();
      const result = await recognizeGearImage(
        file,
        (progress, status) => {
          setOcrProgress(Math.max(0, Math.min(1, progress)));
          setOcrStatus(status);
        },
        definitionId,
      );
      if (result.definitionId !== definitionId) {
        const recognizedName = gearData.gear[result.definitionId]?.name ?? result.definitionId;
        throw new Error(
          `This image contains ${recognizedName}, but the current editor expects ${definitionName}. Open the matching gear slot and try again.`,
        );
      }
      onImport(result);
      onClose();
    } catch (caught) {
      setOcrError(caught instanceof Error ? caught.message : t("ui.buildTab.imageImportError"));
    } finally {
      setOcrBusy(false);
      setOcrStatus("");
    }
  };
  const selectOcrFile = (event: ChangeEvent<HTMLInputElement>) => {
    void importImage(event.target.files?.[0]);
    event.target.value = "";
  };
  const dropOcrFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOcrDragging(false);
    void importImage(event.dataTransfer.files?.[0]);
  };
  const pasteOcrImage = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const clipboardFile =
      Array.from(event.clipboardData.items)
        .find((item) => item.kind === "file" && item.type.startsWith("image/"))
        ?.getAsFile() ?? Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
    if (!clipboardFile) {
      setOcrError(t("ui.buildTab.clipboardImageError"));
      return;
    }
    event.preventDefault();
    void importImage(clipboardFile);
  };
  return (
    <Modal
      open={open}
      onClose={closeOcr}
      onCancel={(event) => {
        if (ocrBusy) event.preventDefault();
      }}
      className="gear-ocr-dialog"
      label={`${t("ui.buildTab.import")} ${definitionName} ${t("ui.buildTab.fromImage")}`}
    >
      <div onPaste={pasteOcrImage}>
        <div className="gear-ocr-heading">
          <div>
            <h2>
              {t("ui.buildTab.import")} {definitionName} {t("ui.buildTab.fromImage")}
            </h2>
            <p>{t("ui.buildTab.useAClearUncroppedGearDetailsScreenshotRecognition")}</p>
          </div>
          <button className="button button-secondary button-small" type="button" disabled={ocrBusy} onClick={closeOcr}>
            {t("ui.buildTab.close")}
          </button>
        </div>
        <div className="gear-ocr-grid">
          <div
            className={`gear-ocr-dropzone ${ocrDragging ? "dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setOcrDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setOcrDragging(false);
            }}
            onDrop={dropOcrFile}
          >
            {ocrPreview ? (
              <img src={ocrPreview} alt={t("ui.buildTab.selectedGearScreenshot")} />
            ) : (
              <div>
                <strong>{t("ui.buildTab.dropAScreenshotOrDirectlyPaste")}</strong>
                <span>{t("ui.buildTab.pressCtrlVOrUsePngJpegOr")}</span>
              </div>
            )}
            <input
              ref={ocrInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={selectOcrFile}
              hidden
            />
            <button
              className="button button-primary"
              type="button"
              disabled={ocrBusy}
              onClick={() => ocrInputRef.current?.click()}
            >
              {ocrPreview ? t("ui.buildTab.chooseAnotherImage") : t("ui.buildTab.chooseImage")}
            </button>
          </div>
          <figure className="gear-ocr-example">
            <img
              src={`${import.meta.env.BASE_URL}ocr/mo-blade-example.png`}
              alt={t("ui.buildTab.exampleMoBladeGearDetailsScreenshot")}
            />
            <figcaption>{t("ui.buildTab.exampleIncludeTheRarityColorGearTypeTier")}</figcaption>
          </figure>
        </div>
        {ocrBusy && (
          <div className="gear-ocr-progress" aria-live="polite">
            <div>
              <span>{ocrStatus || "Reading image"}</span>
              <span>{Math.round(ocrProgress * 100)}%</span>
            </div>
            <progress max={1} value={ocrProgress} />
          </div>
        )}
        {ocrError && (
          <p className="editor-error gear-ocr-error" role="alert">
            {ocrError}
          </p>
        )}
      </div>
    </Modal>
  );
}
