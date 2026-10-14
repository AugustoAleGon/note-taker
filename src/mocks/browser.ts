import { delay, http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { parseSnapshot, snapshot } from "../notes/model";

let data = snapshot([]);
let failedOnce = false;
const scenario = new URLSearchParams(location.search).get("mockApi");
const worker = setupWorker(
  http.get("/api/notes", async () => {
    await delay(400);
    return scenario === "offline"
      ? HttpResponse.error()
      : HttpResponse.json(data);
  }),
  http.put("/api/notes", async ({ request }) => {
    await delay(400);
    if (scenario === "offline") return HttpResponse.error();
    if (scenario === "fail-once" && !failedOnce) {
      failedOnce = true;
      return new HttpResponse(null, { status: 503 });
    }
    const incoming = parseSnapshot(await request.json());
    if (!incoming) return new HttpResponse(null, { status: 400 });
    data = incoming;
    return HttpResponse.json(data);
  }),
);

export async function startMockApi() {
  await worker.start({ onUnhandledFrame: "bypass", quiet: true });
}
