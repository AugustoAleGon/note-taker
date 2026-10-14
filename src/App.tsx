import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_SIZE,
  fitRect,
  notesReducer,
  snapshot,
  type Bounds,
  type Note,
  type NoteColor,
  type Rect,
} from "./notes/model";
import {
  createPersistence,
  readLocal,
  type SaveStatus,
  type StoragePort,
  type Transport,
} from "./notes/persistence";
import { StickyNote } from "./notes/StickyNote";
import { GeometryDialog } from "./notes/GeometryDialog";
import { useGestures } from "./notes/useGestures";
import "./App.css";

const browserStorage: StoragePort = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};
const apiLabels = {
  loading: "Connecting…",
  pending: "Changes waiting",
  saving: "Saving…",
  saved: "All changes saved",
  error: "API unavailable",
} as const;

function App({ api }: { api: Transport }) {
  const [initial] = useState(() => readLocal(browserStorage));
  const [notes, dispatch] = useReducer(notesReducer, initial.data?.notes ?? []);
  const initialNotes = useRef(notes);
  const [bounds, setBounds] = useState<Bounds>({ width: 960, height: 540 });
  const boundsRef = useRef(bounds);
  const [drawing, setDrawing] = useState(false);
  const [dialog, setDialog] = useState<{ note?: Note } | null>(null);
  const [status, setStatus] = useState<SaveStatus>({
    localWarning: initial.warning,
    api: "loading",
    error: null,
  });
  const [announcement, setAnnouncement] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const trashRef = useRef<HTMLDivElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const persistence = useRef<ReturnType<typeof createPersistence> | null>(null);

  const focusTarget = useRef<string | null>(null);
  const focusNote = useCallback((id: string) => {
    focusTarget.current = id;
  }, []);
  useLayoutEffect(() => {
    if (!focusTarget.current) return;
    const textarea = boardRef.current?.querySelector<HTMLTextAreaElement>(
      `[data-note-id="${CSS.escape(focusTarget.current)}"] textarea`,
    );
    focusTarget.current = null;
    textarea?.focus();
  }, [notes, dialog]);
  const createNote = useCallback(
    (rect: Rect, color: NoteColor = "yellow") => {
      const id = crypto.randomUUID();
      dispatch({
        type: "create",
        note: { ...rect, id, color, text: "", zIndex: 0 },
      });
      setDrawing(false);
      setAnnouncement("Note created.");
      focusNote(id);
    },
    [focusNote],
  );
  const removeNote = useCallback((id: string) => {
    dispatch({ type: "remove", id });
    setAnnouncement("Note deleted.");
    newButton.current?.focus();
  }, []);
  const changeRect = useCallback(
    (id: string, rect: Rect) => dispatch({ type: "patch", id, patch: rect }),
    [],
  );
  const { start, cancel } = useGestures({
    boardRef,
    previewRef,
    trashRef,
    onCreate: createNote,
    onChange: changeRect,
    onRemove: removeNote,
    onFinish: () => setDrawing(false),
  });
  const editGeometry = useCallback((note: Note) => {
    setDrawing(false);
    setDialog({ note });
  }, []);

  useEffect(() => {
    const board = boardRef.current!;
    const observer = new ResizeObserver(() => {
      cancel();
      const rect = board.getBoundingClientRect();
      const next = {
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      };
      boundsRef.current = next;
      setBounds(next);
      dispatch({ type: "fit", bounds: next });
    });
    observer.observe(board);
    return () => observer.disconnect();
  }, [cancel]);
  useEffect(() => {
    const store = createPersistence({
      storage: browserStorage,
      transport: api,
      initial,
      onStatus: setStatus,
      onLoad: (data) =>
        dispatch({
          type: "restore",
          notes: data.notes,
          bounds: boundsRef.current,
        }),
    });
    persistence.current = store;
    store.start();
    return () => {
      store.dispose();
      persistence.current = null;
    };
  }, [api, initial]);
  useEffect(() => {
    if (notes !== initialNotes.current)
      persistence.current?.save(snapshot(notes));
  }, [notes]);
  useEffect(() => {
    if (!drawing) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawing(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [drawing]);

  return (
    <main className="workspace">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <h1>
              Little notes<span className="brand-dot">.</span>
            </h1>
            <p>A little space for everything on your mind.</p>
          </div>
        </div>
        <div className="header-meta">
          <span className="workspace-tag">YOUR PERSONAL BOARD</span>
          <span className="note-count">
            {notes.length} {notes.length === 1 ? "note" : "notes"}
          </span>
        </div>
      </header>
      <section className="board-shell" aria-label="Notes workspace">
        <div className="toolbar">
          <div className="toolbar-actions">
            <button
              ref={newButton}
              className="primary"
              onClick={() => {
                setDrawing(false);
                setDialog({});
              }}
            >
              <span aria-hidden="true">＋</span> New note
            </button>
            <button
              className={`secondary draw-button ${drawing ? "active" : ""}`}
              aria-pressed={drawing}
              onClick={() => setDrawing(!drawing)}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m4 13 9-9 3 3-9 9-4 1zM11 6l3 3" />
              </svg>
              {drawing ? "Cancel drawing" : "Draw note"}
            </button>
          </div>
          <div className={`save-status status-${status.api}`} role="status">
            <span className="status-dot" />
            {status.api === "saved" && status.localWarning
              ? "Saved to demo API only"
              : apiLabels[status.api]}
            {status.api === "error" && (
              <button
                className="retry-button"
                onClick={() => persistence.current?.retry()}
              >
                Retry
              </button>
            )}
          </div>
        </div>
        {(status.localWarning || status.error) && (
          <div className="save-warning" role="alert">
            {status.localWarning || "Saved on this device."} {status.error}
          </div>
        )}
        <div className="board-topline">
          <span>THE BIG PICTURE</span>
          <span>
            {drawing
              ? "Drag on empty space to draw · Esc to cancel"
              : "Your ideas, wherever you want them"}
          </span>
        </div>
        <div
          ref={boardRef}
          className={`board ${drawing ? "drawing-mode" : ""}`}
          role="region"
          aria-label="Sticky note board"
          onPointerDown={(event) => {
            if (drawing && event.target === event.currentTarget)
              start("draw", event);
          }}
        >
          {notes.length === 0 && (
            <div className="empty-state" aria-hidden="true">
              <div className="empty-notes">
                <span />
                <span />
                <span>
                  <svg viewBox="0 0 40 40">
                    <path d="M12 14h16M12 20h12M12 26h8" />
                  </svg>
                </span>
              </div>
              <h2>Make room for a thought.</h2>
              <p>
                A reminder, a bright idea, a tiny to-do.
                <br />
                Add your first note and make this space yours.
              </p>
              <span className="empty-hint">
                Start with ＋ New note or draw one anywhere
              </span>
            </div>
          )}
          {notes.map((note) => (
            <StickyNote
              key={note.id}
              note={note}
              dispatch={dispatch}
              onGesture={start}
              onGeometry={editGeometry}
              onDelete={removeNote}
            />
          ))}
          <div ref={previewRef} className="draw-preview" aria-hidden="true">
            <span>New note</span>
          </div>
        </div>
        <footer className="board-footer">
          <div className="board-tip">
            <span aria-hidden="true">↗</span>
            <p>
              <strong>A board that moves with you</strong>
              <br />
              Drag a header to move. Pull a corner to resize.
            </p>
          </div>
          <div
            ref={trashRef}
            className="trash-zone"
            role="group"
            aria-label="Trash drop zone"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" />
            </svg>
            <div>
              <strong>Let it go</strong>
              <span>Drop a note here to delete</span>
            </div>
          </div>
        </footer>
      </section>
      <footer className="app-footer">
        <span>Small notes. Clearer head.</span>
        <span>
          {status.localWarning
            ? "Local saving needs attention"
            : "Automatically saved on this device"}{" "}
          <span aria-hidden="true">·</span> Demo API
        </span>
      </footer>
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
      {dialog && (
        <GeometryDialog
          initial={
            dialog.note ?? {
              ...fitRect({ x: 24, y: 24, ...DEFAULT_SIZE }, bounds),
              color: "yellow",
            }
          }
          bounds={bounds}
          editing={!!dialog.note}
          onClose={() => setDialog(null)}
          onSubmit={(rect, color) => {
            if (dialog.note) {
              dispatch({
                type: "patch",
                id: dialog.note.id,
                patch: { ...rect, color },
              });
              focusNote(dialog.note.id);
            } else createNote(rect, color);
            setDialog(null);
          }}
        />
      )}
    </main>
  );
}
export default App;
