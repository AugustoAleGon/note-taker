export const COLORS = ["yellow", "pink", "blue", "green"] as const;
export type NoteColor = (typeof COLORS)[number];
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Bounds {
  width: number;
  height: number;
}
export interface Note extends Rect {
  id: string;
  text: string;
  color: NoteColor;
  zIndex: number;
}
export interface Snapshot {
  schemaVersion: 1;
  notes: Note[];
}
export const MIN_SIZE: Bounds = { width: 160, height: 120 };
export const DEFAULT_SIZE: Bounds = { width: 240, height: 200 };
export const snapshot = (notes: Note[]): Snapshot => ({
  schemaVersion: 1,
  notes,
});
export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function fitRect(rect: Rect, bounds: Bounds): Rect {
  const width = clamp(
    Math.round(rect.width),
    Math.min(MIN_SIZE.width, bounds.width),
    bounds.width,
  );
  const height = clamp(
    Math.round(rect.height),
    Math.min(MIN_SIZE.height, bounds.height),
    bounds.height,
  );
  return {
    width,
    height,
    x: clamp(Math.round(rect.x), 0, bounds.width - width),
    y: clamp(Math.round(rect.y), 0, bounds.height - height),
  };
}

export function drawRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  bounds: Bounds,
): Rect {
  const x = clamp(end.x, 0, bounds.width);
  const y = clamp(end.y, 0, bounds.height);
  return fitRect(
    {
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      width: Math.abs(start.x - x),
      height: Math.abs(start.y - y),
    },
    bounds,
  );
}

export function resizeRect(
  rect: Rect,
  dx: number,
  dy: number,
  bounds: Bounds,
): Rect {
  return {
    ...rect,
    width: clamp(
      Math.round(rect.width + dx),
      MIN_SIZE.width,
      bounds.width - rect.x,
    ),
    height: clamp(
      Math.round(rect.height + dy),
      MIN_SIZE.height,
      bounds.height - rect.y,
    ),
  };
}

export function contains(rect: Rect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function rectError(rect: Rect, bounds: Bounds): string | null {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isInteger))
    return "Enter whole numbers in every field.";
  if (rect.width < MIN_SIZE.width || rect.height < MIN_SIZE.height)
    return "Notes must be at least 160 × 120 pixels.";
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > bounds.width ||
    rect.y + rect.height > bounds.height
  )
    return "Keep the entire note inside the board.";
  return null;
}

export function parseSnapshot(value: unknown): Snapshot | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("notes" in value) ||
    !Array.isArray(value.notes)
  )
    return null;
  const ids = new Set<string>();
  const notes: Note[] = [];
  for (const item of value.notes as unknown[]) {
    if (!item || typeof item !== "object") return null;
    const n = item as Record<string, unknown>;
    if (
      typeof n.id !== "string" ||
      !n.id ||
      ids.has(n.id) ||
      typeof n.text !== "string" ||
      !COLORS.includes(n.color as NoteColor)
    )
      return null;
    if (
      ![n.x, n.y, n.width, n.height, n.zIndex].every(
        (v) => typeof v === "number" && Number.isFinite(v),
      )
    )
      return null;
    if (
      (n.width as number) <= 0 ||
      (n.height as number) <= 0 ||
      !Number.isSafeInteger(n.zIndex) ||
      (n.zIndex as number) < 0
    )
      return null;
    ids.add(n.id);
    notes.push({
      id: n.id,
      text: n.text,
      color: n.color as NoteColor,
      x: n.x as number,
      y: n.y as number,
      width: n.width as number,
      height: n.height as number,
      zIndex: n.zIndex as number,
    });
  }
  // Keep DOM order when normalizing z-index values.
  const order = [...notes].sort((a, b) => a.zIndex - b.zIndex);
  const ranks = new Map(order.map((note, index) => [note.id, index]));
  return snapshot(
    notes.map((note) => ({ ...note, zIndex: ranks.get(note.id)! })),
  );
}

export type Action =
  | { type: "create"; note: Note }
  | {
      type: "patch";
      id: string;
      patch: Partial<
        Pick<Note, "text" | "color" | "x" | "y" | "width" | "height">
      >;
    }
  | { type: "remove"; id: string }
  | { type: "front"; id: string }
  | { type: "fit"; bounds: Bounds }
  | { type: "restore"; notes: Note[]; bounds: Bounds };

export function notesReducer(notes: Note[], action: Action): Note[] {
  switch (action.type) {
    case "create":
      return [...notes, { ...action.note, zIndex: notes.length }];
    case "patch":
      return notes.map((n) =>
        n.id === action.id ? { ...n, ...action.patch } : n,
      );
    case "remove":
      return notes
        .filter((n) => n.id !== action.id)
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((n, zIndex) => ({ ...n, zIndex }));
    case "front": {
      const target = notes.find((n) => n.id === action.id);
      if (!target || target.zIndex === notes.length - 1) return notes;
      return notes.map((n) =>
        n.id === action.id
          ? { ...n, zIndex: notes.length - 1 }
          : n.zIndex > target.zIndex
            ? { ...n, zIndex: n.zIndex - 1 }
            : n,
      );
    }
    case "restore":
      return action.notes.map((n) => ({ ...n, ...fitRect(n, action.bounds) }));
    case "fit": {
      let changed = false;
      const fitted = notes.map((n) => {
        const rect = fitRect(n, action.bounds);
        if (
          rect.x === n.x &&
          rect.y === n.y &&
          rect.width === n.width &&
          rect.height === n.height
        )
          return n;
        changed = true;
        return { ...n, ...rect };
      });
      return changed ? fitted : notes;
    }
  }
}
