import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  contains,
  drawRect,
  fitRect,
  resizeRect,
  type Bounds,
  type Note,
  type Rect,
} from "./model";

type Gesture = {
  pointerId: number;
  target: HTMLElement;
  node: HTMLElement;
  start: { x: number; y: number };
  last: { x: number; y: number };
  board: DOMRect;
  moved: boolean;
  style: Pick<
    CSSStyleDeclaration,
    "left" | "top" | "width" | "height" | "visibility"
  >;
} & (
  { kind: "draw" } | { kind: "move" | "resize"; original: Rect; noteId: string }
);
interface Options {
  boardRef: RefObject<HTMLDivElement | null>;
  previewRef: RefObject<HTMLDivElement | null>;
  trashRef: RefObject<HTMLDivElement | null>;
  onCreate(rect: Rect): void;
  onChange(id: string, rect: Rect): void;
  onRemove(id: string): void;
  onFinish(): void;
}
export function useGestures(options: Options) {
  const active = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  const cancel = useCallback(() => {
    const g = active.current;
    active.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!g) return;
    Object.assign(g.node.style, g.style);
    g.node.classList.remove("is-dragging");
    callbacks.current.trashRef.current?.classList.remove("is-over");
    document.body.classList.remove("is-interacting");
    if (g.target.hasPointerCapture(g.pointerId))
      g.target.releasePointerCapture(g.pointerId);
    callbacks.current.onFinish();
  }, []);

  useEffect(() => {
    function preview() {
      frame.current = null;
      const g = active.current;
      if (!g) return;
      const dx = g.last.x - g.start.x;
      const dy = g.last.y - g.start.y;
      const bounds: Bounds = g.board;
      let rect: Rect;
      if (g.kind === "draw")
        rect = drawRect(
          { x: g.start.x - g.board.left, y: g.start.y - g.board.top },
          { x: g.last.x - g.board.left, y: g.last.y - g.board.top },
          bounds,
        );
      else if (g.kind === "resize")
        rect = resizeRect(g.original, dx, dy, bounds);
      else rect = { ...g.original, x: g.original.x + dx, y: g.original.y + dy };
      g.node.style.left = `${rect.x}px`;
      g.node.style.top = `${rect.y}px`;
      g.node.style.width = `${rect.width}px`;
      g.node.style.height = `${rect.height}px`;
      g.node.style.visibility = "visible";
      if (g.kind === "move") {
        const trash = callbacks.current.trashRef.current;
        const r = trash?.getBoundingClientRect();
        trash?.classList.toggle(
          "is-over",
          !!r &&
            contains(
              { x: r.left, y: r.top, width: r.width, height: r.height },
              g.last,
            ),
        );
      }
    }
    function move(event: PointerEvent) {
      const g = active.current;
      if (!g || event.pointerId !== g.pointerId) return;
      g.last = { x: event.clientX, y: event.clientY };
      g.moved ||= Math.hypot(g.last.x - g.start.x, g.last.y - g.start.y) >= 4;
      if (g.moved && frame.current === null)
        frame.current = requestAnimationFrame(preview);
    }
    function up(event: PointerEvent) {
      const g = active.current;
      if (!g || event.pointerId !== g.pointerId) return;
      g.last = { x: event.clientX, y: event.clientY };
      g.moved ||= Math.hypot(g.last.x - g.start.x, g.last.y - g.start.y) >= 4;
      const dx = g.last.x - g.start.x;
      const dy = g.last.y - g.start.y;
      const trash = callbacks.current.trashRef.current?.getBoundingClientRect();
      const overTrash =
        trash &&
        contains(
          {
            x: trash.left,
            y: trash.top,
            width: trash.width,
            height: trash.height,
          },
          g.last,
        );
      cancel();
      if (!g.moved) return;
      if (g.kind === "draw")
        callbacks.current.onCreate(
          drawRect(
            { x: g.start.x - g.board.left, y: g.start.y - g.board.top },
            { x: g.last.x - g.board.left, y: g.last.y - g.board.top },
            g.board,
          ),
        );
      else if (g.kind === "move" && overTrash)
        callbacks.current.onRemove(g.noteId);
      else
        callbacks.current.onChange(
          g.noteId,
          g.kind === "resize"
            ? resizeRect(g.original, dx, dy, g.board)
            : fitRect(
                { ...g.original, x: g.original.x + dx, y: g.original.y + dy },
                g.board,
              ),
        );
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    const pointerCancel = (event: PointerEvent) => {
      if (event.pointerId === active.current?.pointerId) cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", pointerCancel);
    window.addEventListener("lostpointercapture", pointerCancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    return () => {
      cancel();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", pointerCancel);
      window.removeEventListener("lostpointercapture", pointerCancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
    };
  }, [cancel]);

  const start = useCallback(
    (
      ...args:
        | [kind: "draw", event: ReactPointerEvent<HTMLElement>]
        | [
            kind: "move" | "resize",
            event: ReactPointerEvent<HTMLElement>,
            note: Note,
          ]
    ) => {
      const [kind, event, note] = args;
      if (event.button !== 0 || !event.isPrimary || active.current) return;
      const board = callbacks.current.boardRef.current?.getBoundingClientRect();
      const node =
        kind === "draw"
          ? callbacks.current.previewRef.current
          : event.currentTarget.closest<HTMLElement>("[data-note-id]");
      if (!board || !node) return;
      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      const common = {
        pointerId: event.pointerId,
        target: event.currentTarget,
        node,
        start: point,
        last: point,
        board,
        moved: false,
        style: {
          left: node.style.left,
          top: node.style.top,
          width: node.style.width,
          height: node.style.height,
          visibility: node.style.visibility,
        },
      };
      active.current =
        kind === "draw"
          ? { ...common, kind }
          : { ...common, kind, original: note, noteId: note.id };
      event.currentTarget.setPointerCapture(event.pointerId);
      node.classList.add("is-dragging");
      document.body.classList.add("is-interacting");
    },
    [],
  );
  return { start, cancel };
}
