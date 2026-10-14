import { memo, type PointerEvent } from "react";
import { COLORS, type Note, type Action } from "./model";

interface Props {
  note: Note;
  dispatch(action: Action): void;
  onGesture(
    kind: "move" | "resize",
    event: PointerEvent<HTMLElement>,
    note: Note,
  ): void;
  onGeometry(note: Note): void;
  onDelete(id: string): void;
}
export const StickyNote = memo(function StickyNote({
  note,
  dispatch,
  onGesture,
  onGeometry,
  onDelete,
}: Props) {
  return (
    <article
      className={`sticky-note note-${note.color}`}
      data-note-id={note.id}
      aria-label="Sticky note"
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.height,
        zIndex: note.zIndex + 1,
      }}
      onPointerDownCapture={() => dispatch({ type: "front", id: note.id })}
      onFocusCapture={() => dispatch({ type: "front", id: note.id })}
    >
      <div className="note-header">
        <button
          className="drag-handle"
          aria-label="Move note"
          title="Drag to move. Use Position & size for keyboard movement."
          onPointerDown={(e) => onGesture("move", e, note)}
          onClick={(event) => {
            if (event.detail === 0) onGeometry(note);
          }}
        >
          <span aria-hidden="true">⠿</span>
          <span className="note-kind">NOTE</span>
        </button>
        <button
          className="note-tool"
          aria-label="Position and size"
          title="Position & size"
          onClick={() => onGeometry(note)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 7V3h4m6 0h4v4M3 13v4h4m10-4v4h-4M7 7h6v6H7z" />
          </svg>
        </button>
        <button
          className="note-tool delete-note"
          aria-label="Delete note"
          title="Delete note"
          onClick={() => onDelete(note.id)}
        >
          ×
        </button>
      </div>
      <textarea
        aria-label="Note text"
        placeholder="Something to remember…"
        value={note.text}
        spellCheck
        onChange={(e) =>
          dispatch({
            type: "patch",
            id: note.id,
            patch: { text: e.target.value },
          })
        }
      />
      <div className="note-footer">
        <label className="note-color-label">
          <span className="sr-only">Note color</span>
          <select
            aria-label="Note color"
            value={note.color}
            onChange={(e) =>
              dispatch({
                type: "patch",
                id: note.id,
                patch: { color: e.target.value as Note["color"] },
              })
            }
          >
            {COLORS.map((color) => (
              <option key={color} value={color}>
                {color[0].toUpperCase() + color.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="resize-handle"
          aria-label="Resize note"
          title="Drag to resize. Use Position & size for exact dimensions."
          onPointerDown={(e) => onGesture("resize", e, note)}
          onClick={(event) => {
            if (event.detail === 0) onGeometry(note);
          }}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 15 10-10M10 15l5-5" />
          </svg>
        </button>
      </div>
    </article>
  );
});
