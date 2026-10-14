import { parseSnapshot, type Snapshot } from "./model";

export const STORAGE_KEY = "sticky-notes:v1";
export type StoragePort = Pick<Storage, "getItem" | "setItem">;
export interface LocalResult {
  data: Snapshot | null;
  warning: string | null;
}
export function readLocal(storage: StoragePort): LocalResult {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { data: null, warning: null };
    const data = parseSnapshot(JSON.parse(raw) as unknown);
    return {
      data,
      warning: data
        ? null
        : "Stored notes could not be read. Trying API recovery.",
    };
  } catch {
    return {
      data: null,
      warning:
        "Local storage is unavailable or contains invalid data. Trying API recovery.",
    };
  }
}

export interface Transport {
  load(signal: AbortSignal): Promise<Snapshot>;
  save(data: Snapshot, signal: AbortSignal): Promise<void>;
}
export type ApiState = "loading" | "pending" | "saving" | "saved" | "error";
export interface SaveStatus {
  localWarning: string | null;
  api: ApiState;
  error: string | null;
}
interface Options {
  storage: StoragePort;
  transport: Transport;
  initial: LocalResult;
  onLoad(data: Snapshot): void;
  onStatus(status: SaveStatus): void;
  debounceMs?: number;
  timeoutMs?: number;
}

// One writer owns ordering, local recovery, and retries. React only submits snapshots.
export function createPersistence(options: Options) {
  const { storage, transport, onLoad, onStatus } = options;
  let latest = options.initial.data;
  let revision = 0;
  let disposed = false;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  let status: SaveStatus = {
    localWarning: options.initial.warning,
    api: latest ? "pending" : "loading",
    error: null,
  };
  const publish = (patch: Partial<SaveStatus>) => {
    status = { ...status, ...patch };
    if (!disposed) onStatus(status);
  };
  function writeLocal(data: Snapshot) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(data));
      publish({ localWarning: null });
    } catch {
      publish({
        localWarning:
          "Local saving unavailable. Notes exist only in this tab; the demo API does not survive reloads.",
      });
    }
  }
  async function perform<T>(
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    request = new AbortController();
    const controller = request;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(new Error("The request was interrupted or timed out.")),
        { once: true },
      );
      timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? 10_000,
      );
    });
    try {
      return await Promise.race([operation(controller.signal), aborted]);
    } finally {
      clearTimeout(timeout);
      if (request === controller) request = undefined;
    }
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void saveRemote();
    }, options.debounceMs ?? 500);
  }
  async function saveRemote() {
    if (disposed || busy || !latest) return;
    busy = true;
    const sent = revision;
    const data = latest;
    publish({ api: "saving", error: null });
    let succeeded = false;
    try {
      await perform((signal) => transport.save(data, signal));
      succeeded = true;
      if (!disposed) publish({ api: sent === revision ? "saved" : "pending" });
    } catch (error) {
      if (!disposed)
        publish({
          api: "error",
          error: error instanceof Error ? error.message : "API saving failed.",
        });
    } finally {
      busy = false;
      if (!disposed && sent !== revision && succeeded) schedule();
    }
  }
  async function loadRemote() {
    if (disposed || busy) return;
    busy = true;
    const started = revision;
    publish({ api: "loading", error: null });
    try {
      const data = await perform((signal) => transport.load(signal));
      if (!disposed && revision === started) {
        latest = data;
        writeLocal(data);
        onLoad(data);
        publish({ api: "saved" });
      }
    } catch (error) {
      if (!disposed)
        publish({
          api: "error",
          error: error instanceof Error ? error.message : "API loading failed.",
        });
    } finally {
      busy = false;
      if (!disposed && revision !== started) schedule();
    }
  }
  return {
    start() {
      publish({});
      if (latest) schedule();
      else void loadRemote();
    },
    save(data: Snapshot) {
      if (
        disposed ||
        (latest && JSON.stringify(latest) === JSON.stringify(data))
      )
        return;
      latest = data;
      revision++;
      writeLocal(data);
      publish({ api: "pending", error: null });
      schedule();
    },
    retry() {
      if (disposed) return;
      clearTimeout(timer);
      if (latest) {
        writeLocal(latest);
        void saveRemote();
      } else void loadRemote();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      request?.abort();
    },
  };
}
