import { test, expect, type Page, type Locator } from "@playwright/test";

const board = (page: Page) =>
  page.getByRole("region", { name: "Sticky note board", exact: true });
const notes = (page: Page) =>
  page.getByRole("article", { name: "Sticky note", exact: true });
async function ready(page: Page, path = "/") {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Little notes." }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("All changes saved");
}
async function create(
  page: Page,
  values: { x?: number; y?: number; width?: number; height?: number } = {},
) {
  await page.getByRole("button", { name: "New note", exact: true }).click();
  for (const [key, value] of Object.entries(values))
    await page
      .getByRole("spinbutton", {
        name: {
          x: "X position",
          y: "Y position",
          width: "Width",
          height: "Height",
        }[key as "x"],
      })
      .fill(String(value));
  await page.getByRole("button", { name: "Create note", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return notes(page).last();
}
async function drag(page: Page, locator: Locator, dx: number, dy: number) {
  const r = (await locator.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    Math.max(0, r.x + r.width / 2 + dx),
    Math.max(0, r.y + r.height / 2 + dy),
    { steps: 8 },
  );
  await page.mouse.up();
}
async function geometry(note: Locator) {
  return note.evaluate((el) => ({
    x: parseInt(el.style.left),
    y: parseInt(el.style.top),
    width: parseInt(el.style.width),
    height: parseInt(el.style.height),
  }));
}

test("numeric creation, text, color, keyboard geometry, and reload restoration", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const note = await create(page, { x: 100, y: 80, width: 260, height: 220 });
  await expect(note.getByRole("textbox", { name: "Note text" })).toBeFocused();
  await note
    .getByRole("textbox")
    .fill("Remember the little things.\n<script>plain text</script>");
  await note.getByRole("combobox").selectOption("blue");
  await note.getByRole("button", { name: "Move note" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("spinbutton", { name: "X position" }).fill("180");
  await page.getByRole("spinbutton", { name: "Width" }).fill("300");
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect
    .poll(() => geometry(note))
    .toEqual({ x: 180, y: 80, width: 300, height: 220 });
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.reload();
  await expect(notes(page)).toHaveCount(1);
  await expect(notes(page).getByRole("textbox")).toHaveValue(
    "Remember the little things.\n<script>plain text</script>",
  );
  await expect(notes(page).getByRole("combobox")).toHaveValue("blue");
  expect(await geometry(notes(page))).toEqual({
    x: 180,
    y: 80,
    width: 300,
    height: 220,
  });
  expect(errors).toEqual([]);
});

test("drawing in reverse, clicks do not create, and drawing can be cancelled", async ({
  page,
}) => {
  await ready(page);
  const r = (await board(page).boundingBox())!;
  await page.getByRole("button", { name: "Draw note" }).click();
  await page.mouse.click(r.x + 100, r.y + 100);
  await expect(notes(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Draw note" }).click();
  await page.mouse.move(r.x + 400, r.y + 350);
  await page.mouse.down();
  await page.mouse.move(r.x + 100, r.y + 100, { steps: 8 });
  await page.mouse.up();
  await expect(notes(page)).toHaveCount(1);
  expect(await geometry(notes(page))).toEqual({
    x: 100,
    y: 100,
    width: 300,
    height: 250,
  });
  await page.getByRole("button", { name: "Draw note" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Draw note" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("move and resize commit final pointer position, clamp boundaries, and cancel cleanly", async ({
  page,
}) => {
  await ready(page);
  const note = await create(page, { x: 80, y: 70 });
  await drag(page, note.getByRole("button", { name: "Move note" }), 170, 100);
  expect(await geometry(note)).toEqual({
    x: 250,
    y: 170,
    width: 240,
    height: 200,
  });
  await drag(page, note.getByRole("button", { name: "Resize note" }), 70, 50);
  expect(await geometry(note)).toEqual({
    x: 250,
    y: 170,
    width: 310,
    height: 250,
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await drag(
    page,
    note.getByRole("button", { name: "Resize note" }),
    -250,
    -200,
  );
  expect(await geometry(note)).toEqual({
    x: 250,
    y: 170,
    width: 160,
    height: 120,
  });
  const handle = (await note
    .getByRole("button", { name: "Move note" })
    .boundingBox())!;
  await page.mouse.move(handle.x + 20, handle.y + 15);
  await page.mouse.down();
  await page.mouse.move(handle.x + 120, handle.y + 80, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await geometry(note)).toEqual({
    x: 250,
    y: 170,
    width: 160,
    height: 120,
  });
  await drag(page, note.getByRole("button", { name: "Move note" }), -500, -500);
  expect(await geometry(note)).toEqual({ x: 0, y: 0, width: 160, height: 120 });
});

test("trash activates only during movement and deletes only on release", async ({
  page,
}) => {
  await ready(page);
  const note = await create(page);
  const handle = (await note
    .getByRole("button", { name: "Move note" })
    .boundingBox())!;
  const target = page.getByRole("group", {
    name: "Trash drop zone",
    exact: true,
  });
  const trash = (await target.boundingBox())!;
  await page.mouse.move(handle.x + 20, handle.y + 15);
  await page.mouse.down();
  await page.mouse.move(trash.x + 50, trash.y + 20, { steps: 10 });
  await expect(target).toHaveClass(/is-over/);
  await expect(notes(page)).toHaveCount(1);
  await page.mouse.move(handle.x + 30, handle.y + 25, { steps: 10 });
  await page.mouse.up();
  await expect(notes(page)).toHaveCount(1);
  const second = (await note
    .getByRole("button", { name: "Move note" })
    .boundingBox())!;
  await page.mouse.move(second.x + 20, second.y + 15);
  await page.mouse.down();
  await page.mouse.move(trash.x + 50, trash.y + 20, { steps: 10 });
  await page.mouse.up();
  await expect(notes(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "New note", exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(notes(page)).toHaveCount(0);
});

test("focus raises an overlapping note and keyboard deletion returns focus", async ({
  page,
}) => {
  await ready(page);
  await create(page, { x: 50, y: 50 });
  await create(page, { x: 180, y: 100 });
  const first = notes(page).first();
  await first.getByRole("textbox").focus();
  await expect(first).toHaveCSS("z-index", "2");
  await first.getByRole("button", { name: "Delete note", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(notes(page)).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "New note", exact: true }),
  ).toBeFocused();
});

test("invalid numeric forms remain open with useful errors and Escape returns focus", async ({
  page,
}) => {
  await ready(page);
  const button = page.getByRole("button", { name: "New note", exact: true });
  await button.click();
  await page.getByRole("spinbutton", { name: "Width" }).fill("159");
  await page.getByRole("button", { name: "Create note", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("at least 160 × 120");
  await page.getByRole("spinbutton", { name: "Width" }).fill("240");
  await page.getByRole("spinbutton", { name: "X position" }).fill("9999");
  await page.getByRole("button", { name: "Create note", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("inside the board");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(button).toBeFocused();
});

test("failed API saving keeps local edits and retry succeeds", async ({
  page,
}) => {
  await ready(page, "/?mockApi=fail-once");
  await create(page);
  await notes(page).getByRole("textbox").fill("Kept safely");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("sticky-notes:v1")!).notes[0].text,
    ),
  ).toBe("Kept safely");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.reload();
  await expect(notes(page).getByRole("textbox")).toHaveValue("Kept safely");
});

test("corrupted local data recovers and offline mode still permits editing", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("sticky-notes:v1", "{invalid"),
  );
  await page.goto("/?mockApi=offline");
  await expect(page.getByRole("alert")).toContainText("invalid data");
  await create(page);
  await notes(page).getByRole("textbox").fill("Still usable offline");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("sticky-notes:v1")!).notes[0].text,
    ),
  ).toBe("Still usable offline");
});

test("notes fit a shrinking viewport at the minimum supported size", async ({
  page,
}) => {
  await ready(page);
  const r = (await board(page).boundingBox())!;
  await create(page, {
    x: Math.floor(r.width - 300),
    y: Math.floor(r.height - 240),
    width: 300,
    height: 240,
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect
    .poll(async () => {
      const b = (await board(page).boundingBox())!;
      const n = (await notes(page).boundingBox())!;
      return (
        n.x >= b.x &&
        n.y >= b.y &&
        n.x + n.width <= b.x + b.width &&
        n.y + n.height <= b.y + b.height
      );
    })
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1024,
  );
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    768,
  );
});

test("pointer cancellation and blur restore geometry without committing a drag", async ({
  page,
}) => {
  await ready(page);
  const note = await create(page, { x: 100, y: 100 });
  const before = await geometry(note);
  await page.evaluate(() =>
    window.addEventListener("pointerdown", (event) => {
      Object.assign(window, { lastPointerId: event.pointerId });
    }),
  );
  for (const cancelType of ["pointercancel", "blur"]) {
    const h = (await note
      .getByRole("button", { name: "Move note" })
      .boundingBox())!;
    await page.mouse.move(h.x + 20, h.y + 15);
    await page.mouse.down();
    await page.mouse.move(h.x + 150, h.y + 60, { steps: 5 });
    await page.evaluate((type) => {
      if (type === "blur") window.dispatchEvent(new Event("blur"));
      else
        window.dispatchEvent(
          new PointerEvent("pointercancel", {
            pointerId: (window as unknown as { lastPointerId: number })
              .lastPointerId,
          }),
        );
    }, cancelType);
    await page.mouse.up();
    expect(await geometry(note)).toEqual(before);
  }
});

test("100 notes drag without storage writes on pointer movements", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "sticky-notes:v1",
      JSON.stringify({
        schemaVersion: 1,
        notes: Array.from({ length: 100 }, (_, i) => ({
          id: `note-${i}`,
          text: `Idea ${i + 1}`,
          color: "yellow",
          x: (i % 10) * 90,
          y: Math.floor(i / 10) * 30,
          width: 160,
          height: 120,
          zIndex: i,
        })),
      }),
    );
    const original = Storage.prototype.setItem;
    Object.assign(window, { storageWrites: 0 });
    Storage.prototype.setItem = function (...args) {
      Object.assign(window, {
        storageWrites:
          (window as unknown as { storageWrites: number }).storageWrites + 1,
      });
      return original.apply(this, args);
    };
  });
  await ready(page);
  await expect(notes(page)).toHaveCount(100);
  const note = notes(page).last();
  const h = (await note
    .getByRole("button", { name: "Move note" })
    .boundingBox())!;
  await page.mouse.move(h.x + 20, h.y + 15);
  await page.mouse.down();
  const before = await page.evaluate(
    () => (window as unknown as { storageWrites: number }).storageWrites,
  );
  await page.mouse.move(h.x + 120, h.y + 65, { steps: 30 });
  expect(
    await page.evaluate(
      () => (window as unknown as { storageWrites: number }).storageWrites,
    ),
  ).toBe(before);
  await page.mouse.up();
  expect(
    await page.evaluate(
      () => (window as unknown as { storageWrites: number }).storageWrites,
    ),
  ).toBe(before + 1);
});

test("blocked local storage and worker startup leave the board usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Storage blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Storage blocked");
    };
    navigator.serviceWorker.register = () =>
      Promise.reject(new Error("Worker blocked"));
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  const note = await create(page);
  await note.getByRole("textbox").fill("Kept in this tab");
  await expect(note.getByRole("textbox")).toHaveValue("Kept in this tab");
  await expect(page.getByRole("alert")).toContainText(
    "Local saving unavailable",
  );
});

test("editing and selecting text never moves a note; lost capture cancels resizing", async ({
  page,
}) => {
  await ready(page);
  const note = await create(page);
  const textarea = note.getByRole("textbox");
  await textarea.fill("A long thought\n".repeat(30));
  await textarea.press("ControlOrMeta+a");
  expect(
    await textarea.evaluate((el) => (el as HTMLTextAreaElement).selectionEnd),
  ).toBeGreaterThan(0);
  const before = await geometry(note);
  expect(
    await textarea.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  await page.evaluate(() =>
    window.addEventListener("pointerdown", (event) => {
      Object.assign(window, { lastPointerId: event.pointerId });
    }),
  );
  const handle = note.getByRole("button", { name: "Resize note" });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 60, { steps: 6 });
  await handle.evaluate((el) =>
    el.releasePointerCapture(
      (window as unknown as { lastPointerId: number }).lastPointerId,
    ),
  );
  // Releasing capture dispatches lostpointercapture before the next pointer event.
  await page.mouse.move(box.x + 110, box.y + 70);
  await page.mouse.up();
  expect(await geometry(note)).toEqual(before);
});

test("dragging a background note keeps its new front order after release or cancellation", async ({
  page,
}) => {
  await ready(page);
  await create(page, { x: 80, y: 60 });
  await create(page, { x: 400, y: 60 });
  const first = notes(page).first();
  const last = notes(page).last();
  await drag(page, first.getByRole("button", { name: "Move note" }), 30, 30);
  await expect(first).toHaveCSS("z-index", "2");
  await last.getByRole("textbox").focus();
  const h = (await first
    .getByRole("button", { name: "Move note" })
    .boundingBox())!;
  await page.mouse.move(h.x + 20, h.y + 15);
  await page.mouse.down();
  await page.mouse.move(h.x + 60, h.y + 40, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(first).toHaveCSS("z-index", "2");
});
