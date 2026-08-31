/** Paste os_query_builder JSON to hydrate the builder. */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImportStep } from "../../lib/oslcImport";
import { Icon, faUpload } from "../Icon";

export default function ImportDialog({
  onImport,
  onClose,
}: {
  onImport: (text: string, origin: DOMRect, onProgress: (steps: ImportStep[]) => void) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [steps, setSteps] = useState<ImportStep[]>([]);
  const dialog = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setFileName(file.name);
      setError(null);
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  }

  async function submit() {
    setError(null);
    setSteps([]);
    setBusy(true);
    const origin = dialog.current?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2, 160, 320, 240);
    try {
      await onImport(text, origin, setSteps);
      await new Promise((r) => setTimeout(r, 450));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="import-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialog}
        className={`import-dialog${error ? " shake" : ""}${dragOver ? " drop" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) readFile(file);
        }}
      >
        <label className="lbl">Import tool-call JSON or an OSLC GET URL</label>
        <div className="import-file-row">
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json,.txt,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <Icon icon={faUpload} /> Choose JSON file
          </button>
          {fileName && <span className="muted mono">{fileName}</span>}
        </div>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder={'Drop a .json file, or paste:\n{ "opAction": "query", "osName": "MXAPIASSET", ... }\n\nor\nhttp://host/maximo/oslc/os/MXAPIASSET?oslc.select=...'}
          rows={10}
          disabled={busy}
        />
        {steps.length > 0 && (
          <ol className="import-steps">
            {steps.map((s) => (
              <li key={s.id} className={s.status}>
                <span className="import-step-mark" aria-hidden>
                  {s.status === "running" ? <span className="spinner" /> : s.status === "warn" ? "!" : "ok"}
                </span>
                <div>
                  <div className="import-step-label">
                    {s.label}
                    {s.detail ? <span className="muted"> - {s.detail}</span> : null}
                  </div>
                  {s.lines?.map((line, i) => (
                    <div key={`${s.id}-${i}`} className="import-step-line">{line}</div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
        {error && <p className="import-error">{error}</p>}
        <div className="import-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="go"
            style={{ width: "auto", padding: "6px 16px" }}
            onClick={() => void submit()}
            disabled={!text.trim() || busy}
          >
            {busy ? "Importing..." : "Apply"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
