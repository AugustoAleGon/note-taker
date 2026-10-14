import { describe, expect, it, vi } from "vitest";
import { createApi } from "./api";
import { snapshot } from "./model";

describe("REST transport", () => {
  it("waits for worker readiness and uses GET and PUT with JSON", async () => {
    let ready!: () => void;
    const startup = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(snapshot([])));
    const api = createApi(startup, fetcher);
    const signal = new AbortController().signal;
    const loading = api.load(signal);
    expect(fetcher).not.toHaveBeenCalled();
    ready();
    expect(await loading).toEqual(snapshot([]));
    await api.save(snapshot([]), signal);
    expect(fetcher).toHaveBeenLastCalledWith("/api/notes", {
      method: "PUT",
      signal,
      body: JSON.stringify(snapshot([])),
      headers: { "Content-Type": "application/json" },
    });
  });
  it("rejects non-success statuses, invalid payloads, and failed worker startup", async () => {
    const signal = new AbortController().signal;
    await expect(
      createApi(
        Promise.resolve(),
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(null, { status: 503 })),
      ).load(signal),
    ).rejects.toThrow("503");
    await expect(
      createApi(
        Promise.resolve(),
        vi.fn<typeof fetch>().mockResolvedValue(Response.json({ notes: [] })),
      ).load(signal),
    ).rejects.toThrow("invalid note data");
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createApi(Promise.reject(new Error("worker unavailable")), fetcher).load(
        signal,
      ),
    ).rejects.toThrow("worker unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not send a request after cancellation while waiting for startup", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createApi(Promise.resolve(), fetcher).load(controller.signal),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
