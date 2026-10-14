# Little notes

A desktop sticky-note app built with React and TypeScript. It includes all four core features and all five bonuses from the exercise. The UI, dragging, and resizing use custom code.

## Live demo

[Open Little notes](https://note-taker-nu-wine.vercel.app/) to test the app without local setup. Use a desktop browser with a viewport of at least 1024 × 768.

## Run

Use Node.js 22.12+ and pnpm 10.12.1. Development used Node.js 22.16.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL that Vite prints. To build and preview:

```sh
pnpm build
pnpm preview
```

Use localhost or HTTPS for the mock API's service worker. The mock runs in development and preview. Local editing still works if the worker fails.

## Controls

| Action               | Control                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Create               | Select **New note** for exact dimensions, or **Draw note** to draw on empty board space. |
| Move                 | Drag the note header.                                                                    |
| Resize               | Drag the bottom-right corner.                                                            |
| Delete               | Release a dragged note over **Let it go**, or use its Delete button.                     |
| Edit                 | Type in the note. Long text scrolls inside it.                                           |
| Change color         | Use the note's color menu.                                                               |
| Change overlap order | Click or focus a note to bring it to the front.                                          |

**Position and size** provides keyboard controls for moving and resizing. Escape closes a dialog or cancels a drag. New notes receive text focus. Deletion returns focus to **New note**.

Coordinates start at the board's top-left corner. Notes default to 240 × 200 px, with a minimum of 160 × 120 px. Notes stay inside the board and adjust when the window shrinks. The minimum supported viewport is 1024 × 768.

## Architecture

The model in `src/notes/model.ts` defines notes, checks stored data, and calculates geometry. A reducer updates note state. React renders the board and manages dialogs and focus. Strict TypeScript checks apply throughout the app.

The gesture hook handles drawing, moving, resizing, and cancellation through Pointer Events. Refs hold temporary positions. Drag previews update at most once per animation frame. On release, React receives the final geometry. Stable note IDs preserve DOM order while z-index controls overlap.

The persistence module handles local storage and API requests. Storage and transport dependencies allow tests without React. One request runs at a time, with pending edits combined into the latest snapshot. Older responses cannot overwrite new edits or mark them as saved. Mock Service Worker (MSW) supplies the asynchronous REST API.

## Saving

Local storage saves note text, geometry, order, and colors under `sticky-notes:v1`. On startup, valid local data takes priority, including an empty board. Otherwise, the app loads from the API. Invalid stored data produces a warning.

API saves wait 500 ms after a change. Drag previews do not trigger saves. Requests time out after 10 seconds. **Retry** submits the latest notes or retries initial loading.

| Endpoint         | Behavior                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /api/notes` | Returns `{ schemaVersion: 1, notes: [...] }`.                                                               |
| `PUT /api/notes` | Replaces the snapshot and returns it. Invalid data returns 400. Deleted notes are absent from the snapshot. |

The mock adds a 400 ms delay and resets on reload. **Local storage provides persistence.** If local storage fails, notes exist only in the current tab, even after a successful API save.

To test failures, append a query string to the app URL:

- `?mockApi=fail-once`: the first save returns 503. Retry succeeds. Reloading resets the scenario.
- `?mockApi=offline`: API requests fail. Editing and local saving remain available.

After an MSW upgrade, regenerate its worker:

```sh
pnpm exec msw init public --save
```

## Tests

```sh
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm exec playwright install chromium firefox
pnpm test:e2e
pnpm test:e2e:preview
```

Browser tests use port 4173 for development and 4174 for a fresh production preview. Failed tests retain traces in `test-results/`.

For installed Chrome or Edge browsers:

```sh
pnpm exec playwright test --project=chrome
pnpm exec playwright test --project=edge
```

Checks passed on macOS on 2026-10-14:

- 23 logic tests and 30 production-browser tests across Chromium and Playwright Firefox.
- The branded Chrome test, build, lint, and formatting checks.
- Visual checks at 1024 × 768 and 1440 × 900.

Tests cover note controls, keyboard access, reloads, cancelled drags, save failures, and 100-note dragging without intermediate storage writes.

This app supports one user in one tab. It has no real backend, authentication, multi-tab synchronization, or undo. It sends no note data to external servers.
