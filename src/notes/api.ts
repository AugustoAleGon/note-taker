import { parseSnapshot } from "./model";
import type { Transport } from "./persistence";

export function createApi(
  ready: Promise<unknown>,
  fetcher: typeof fetch = fetch,
): Transport {
  async function request(
    method: "GET" | "PUT",
    signal: AbortSignal,
    body?: string,
  ) {
    await ready;
    signal.throwIfAborted();
    const response = await fetcher("/api/notes", {
      method,
      signal,
      ...(body
        ? { body, headers: { "Content-Type": "application/json" } }
        : {}),
    });
    if (!response.ok)
      throw new Error(
        `API ${method === "GET" ? "loading" : "saving"} failed (${response.status}). Your edits are kept in this tab.`,
      );
    const data = parseSnapshot((await response.json()) as unknown);
    if (!data) throw new Error("The API returned invalid note data.");
    return data;
  }
  return {
    load: (signal) => request("GET", signal),
    save: async (data, signal) => {
      await request("PUT", signal, JSON.stringify(data));
    },
  };
}
