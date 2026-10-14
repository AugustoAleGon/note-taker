import { test, expect } from "@playwright/test";

test("branded browser supports creation, editing, dragging, resizing, and reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("button", { name: "Create note", exact: true }).click();
  const note = page.getByRole("article", { name: "Sticky note", exact: true });
  await note.getByRole("textbox").fill("Browser check");
  for (const name of ["Move note", "Resize note"]) {
    const box = (await note
      .getByRole("button", { name, exact: true })
      .boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 80,
      box.y + box.height / 2 + 50,
      { steps: 5 },
    );
    await page.mouse.up();
  }
  await expect(note).toHaveCSS("left", "104px");
  await expect(note).toHaveCSS("width", "320px");
  await page.reload();
  await expect(note.getByRole("textbox")).toHaveValue("Browser check");
});
