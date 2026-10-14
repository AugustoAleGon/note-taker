import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import {
  COLORS,
  rectError,
  type Bounds,
  type NoteColor,
  type Rect,
} from "./model";

interface Props {
  initial: Rect & { color: NoteColor };
  bounds: Bounds;
  editing: boolean;
  onSubmit(rect: Rect, color: NoteColor): void;
  onClose(): void;
}
export function GeometryDialog({
  initial,
  bounds,
  editing,
  onSubmit,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState({
    x: String(initial.x),
    y: String(initial.y),
    width: String(initial.width),
    height: String(initial.height),
  });
  const [color, setColor] = useState(initial.color);
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    el.showModal();
    return () => {
      el.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    const rect = {
      x: Number(values.x),
      y: Number(values.y),
      width: Number(values.width),
      height: Number(values.height),
    };
    const invalid = Object.values(values).some((v) => !v.trim())
      ? "Complete every field."
      : rectError(rect, bounds);
    setError(invalid);
    if (!invalid) onSubmit(rect, color);
  }
  return (
    <dialog
      ref={dialog}
      className="geometry-dialog"
      aria-labelledby="dialog-title"
      onCancel={onClose}
    >
      <form onSubmit={submit} noValidate>
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">MAKE SOME SPACE</span>
            <h2 id="dialog-title">
              {editing ? "Position & size" : "A fresh note"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <p className="muted">
          Measured in pixels from the top-left of your board.
          <br />
          Board: {Math.floor(bounds.width)} × {Math.floor(bounds.height)} px
        </p>
        <div className="geometry-fields">
          {(["x", "y", "width", "height"] as const).map((field) => (
            <label key={field}>
              {
                {
                  x: "X position",
                  y: "Y position",
                  width: "Width",
                  height: "Height",
                }[field]
              }
              <input
                autoFocus={field === "x"}
                type="number"
                step="1"
                value={values[field]}
                aria-describedby={error ? "geometry-error" : undefined}
                onChange={(e) =>
                  setValues({ ...values, [field]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
        <label className="color-field">
          Note color
          <select
            value={color}
            onChange={(e) => setColor(e.target.value as NoteColor)}
          >
            {COLORS.map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p id="geometry-error" className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            {editing ? "Apply changes" : "Create note"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
