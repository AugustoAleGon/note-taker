import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPersistence,
  readLocal,
  STORAGE_KEY,
  type SaveStatus,
  type Transport,
} from "./persistence";
import { snapshot, type Snapshot } from "./model";
const makeData = (text: string) =>
  snapshot([
    {
      id: "a",
      x: 0,
      y: 0,
      width: 200,
      height: 180,
      text,
      color: "yellow",
      zIndex: 0,
    },
  ]);
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function setup(
  initial: Snapshot | null = snapshot([]),
  custom?: Partial<Transport>,
) {
  const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
  const transport = {
    load: vi.fn(async () => snapshot([])),
    save: vi.fn(async () => {}),
    ...custom,
  };
  const onLoad = vi.fn();
  const statuses: SaveStatus[] = [];
  const store = createPersistence({
    storage,
    transport,
    initial: { data: initial, warning: null },
    onLoad,
    onStatus: (status) => statuses.push(status),
  });
  return { store, storage, transport, onLoad, statuses };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("local recovery", () => {
  it("reads versioned data and handles corrupted or inaccessible storage", () => {
    expect(
      readLocal({
        getItem: () => JSON.stringify(makeData("saved")),
        setItem() {},
      }).data,
    ).toEqual(makeData("saved"));
    expect(
      readLocal({ getItem: () => "{", setItem() {} }).warning,
    ).toBeTruthy();
    expect(
      readLocal({
        getItem: () => {
          throw new Error("denied");
        },
        setItem() {},
      }).warning,
    ).toBeTruthy();
  });
  it("keeps editing and API saving available if local writes fail", async () => {
    const ctx = setup();
    ctx.storage.setItem.mockImplementation(() => {
      throw new Error("quota");
    });
    ctx.store.start();
    ctx.store.save(makeData("keep me"));
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx.statuses.at(-1)).toMatchObject({
      api: "saved",
      localWarning: expect.any(String),
    });
    expect(ctx.transport.save).toHaveBeenCalled();
    ctx.store.dispose();
  });
});
describe("ordered async persistence", () => {
  it("writes locally immediately and debounces API updates", async () => {
    const ctx = setup();
    ctx.store.start();
    ctx.store.save(makeData("one"));
    ctx.store.save(makeData("two"));
    expect(ctx.storage.setItem).toHaveBeenLastCalledWith(
      STORAGE_KEY,
      JSON.stringify(makeData("two")),
    );
    expect(ctx.transport.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx.transport.save).toHaveBeenCalledTimes(1);
    expect(ctx.transport.save).toHaveBeenCalledWith(
      makeData("two"),
      expect.any(AbortSignal),
    );
    ctx.store.dispose();
  });
  it("serializes saves and never marks newer edits saved on an old response", async () => {
    const pending = deferred<void>();
    const save = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(undefined);
    const ctx = setup(snapshot([]), { save });
    ctx.store.start();
    ctx.store.save(makeData("first"));
    await vi.advanceTimersByTimeAsync(500);
    ctx.store.save(makeData("second"));
    ctx.store.save(makeData("third"));
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.statuses.at(-1)?.api).toBe("pending");
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(
      makeData("third"),
      expect.any(AbortSignal),
    );
    expect(ctx.statuses.at(-1)?.api).toBe("saved");
    ctx.store.dispose();
  });
  it("preserves failed changes and retries the latest snapshot", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const ctx = setup(snapshot([]), { save });
    ctx.store.start();
    ctx.store.save(makeData("first"));
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx.statuses.at(-1)?.api).toBe("error");
    ctx.store.save(makeData("latest"));
    ctx.store.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenLastCalledWith(
      makeData("latest"),
      expect.any(AbortSignal),
    );
    expect(ctx.statuses.at(-1)?.api).toBe("saved");
    ctx.store.dispose();
  });
  it("ignores late remote loading after edits", async () => {
    const pending = deferred<Snapshot>();
    const ctx = setup(null, { load: () => pending.promise });
    ctx.store.start();
    ctx.store.save(makeData("local"));
    pending.resolve(makeData("stale remote"));
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx.onLoad).not.toHaveBeenCalled();
    expect(ctx.transport.save).toHaveBeenCalledWith(
      makeData("local"),
      expect.any(AbortSignal),
    );
    ctx.store.dispose();
  });
  it("restores remote data only when local recovery is absent", async () => {
    const ctx = setup(null, { load: async () => makeData("remote") });
    ctx.store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.onLoad).toHaveBeenCalledWith(makeData("remote"));
    expect(ctx.storage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(makeData("remote")),
    );
    ctx.store.dispose();
    const local = setup(snapshot([]));
    local.store.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(local.transport.load).not.toHaveBeenCalled();
    expect(local.transport.save).toHaveBeenCalledWith(
      snapshot([]),
      expect.any(AbortSignal),
    );
    local.store.dispose();
  });
  it("times out a request even if a transport ignores its abort signal", async () => {
    const pending = deferred<void>();
    const ctx = setup(snapshot([]), { save: () => pending.promise });
    ctx.store.start();
    await vi.advanceTimersByTimeAsync(10_500);
    expect(ctx.statuses.at(-1)).toMatchObject({
      api: "error",
      error: expect.stringContaining("timed out"),
    });
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.statuses.at(-1)?.api).toBe("error");
    ctx.store.dispose();
  });
  it("cancels pending work and ignores results after disposal", async () => {
    const pending = deferred<Snapshot>();
    const ctx = setup(null, { load: () => pending.promise });
    ctx.store.start();
    ctx.store.dispose();
    pending.resolve(makeData("late"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(ctx.onLoad).not.toHaveBeenCalled();
    expect(ctx.transport.save).not.toHaveBeenCalled();
  });
});
