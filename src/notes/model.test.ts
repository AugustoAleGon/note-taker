import { describe, expect, it } from "vitest";
import {
  contains,
  drawRect,
  fitRect,
  notesReducer,
  parseSnapshot,
  rectError,
  resizeRect,
  snapshot,
  type Note,
} from "./model";
const bounds = { width: 800, height: 500 };
const note: Note = {
  id: "a",
  text: "hello",
  color: "yellow",
  x: 50,
  y: 50,
  width: 240,
  height: 200,
  zIndex: 0,
};

describe("board geometry", () => {
  it.each([
    [100, 100, 400, 350],
    [400, 350, 100, 100],
    [400, 100, 100, 350],
    [100, 350, 400, 100],
  ])("draws in any direction", (x, y, ex, ey) => {
    expect(drawRect({ x, y }, { x: ex, y: ey }, bounds)).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 250,
    });
  });
  it("fits small drawings at the bottom-right and clamps off-board endpoints", () => {
    expect(drawRect({ x: 790, y: 490 }, { x: 900, y: 600 }, bounds)).toEqual({
      x: 640,
      y: 380,
      width: 160,
      height: 120,
    });
    expect(drawRect({ x: 100, y: 100 }, { x: -50, y: -50 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 160,
      height: 120,
    });
  });
  it("fits oversized notes and clamps movement", () => {
    expect(
      fitRect({ x: 900, y: -100, width: 1000, height: 1000 }, bounds),
    ).toEqual({ x: 0, y: 0, width: 800, height: 500 });
    expect(fitRect({ ...note, x: 700, y: 450 }, bounds)).toEqual({
      x: 560,
      y: 300,
      width: 240,
      height: 200,
    });
  });
  it("resizes without moving the anchor and respects minimum and maximum", () => {
    expect(resizeRect(note, -500, -500, bounds)).toEqual({
      ...note,
      width: 160,
      height: 120,
    });
    expect(resizeRect(note, 900, 900, bounds)).toEqual({
      ...note,
      width: 750,
      height: 450,
    });
  });
  it("validates numeric geometry and inclusive trash boundaries", () => {
    expect(rectError(note, bounds)).toBeNull();
    for (const rect of [
      { ...note, x: NaN },
      { ...note, x: 0.1 },
      { ...note, width: 159 },
      { ...note, y: -1 },
      { ...note, x: 799 },
    ])
      expect(rectError(rect, bounds)).not.toBeNull();
    expect(contains(note, { x: 50, y: 250 })).toBe(true);
    expect(contains(note, { x: 49, y: 250 })).toBe(false);
  });
});

describe("note state and external snapshots", () => {
  it("raises notes with bounded stacking without changing DOM order", () => {
    const notes = [
      note,
      { ...note, id: "b", zIndex: 1 },
      { ...note, id: "c", zIndex: 2 },
    ];
    const raised = notesReducer(notes, { type: "front", id: "a" });
    expect(raised.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(raised.map((n) => n.zIndex)).toEqual([2, 0, 1]);
    expect(notesReducer(raised, { type: "front", id: "a" })).toBe(raised);
    expect(
      notesReducer(raised, { type: "remove", id: "b" }).map((n) => n.zIndex),
    ).toEqual([0, 1]);
  });
  it("keeps unchanged notes referentially stable when fitting or editing", () => {
    const notes = [note, { ...note, id: "b" }];
    expect(notesReducer(notes, { type: "fit", bounds })).toBe(notes);
    expect(
      notesReducer(notes, {
        type: "patch",
        id: "a",
        patch: { text: "changed" },
      })[1],
    ).toBe(notes[1]);
  });
  it("roundtrips plain text and rejects malformed or duplicate data", () => {
    expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot([note]))))).toEqual(
      snapshot([note]),
    );
    for (const value of [
      null,
      {},
      { schemaVersion: 2, notes: [] },
      snapshot([note, note]),
      snapshot([{ ...note, width: Infinity }]),
      snapshot([{ ...note, height: 0 }]),
      snapshot([{ ...note, color: "purple" as Note["color"] }]),
      snapshot([{ ...note, zIndex: -1 }]),
      snapshot([{ ...note, text: 5 as unknown as string }]),
    ])
      expect(parseSnapshot(value)).toBeNull();
  });
});
