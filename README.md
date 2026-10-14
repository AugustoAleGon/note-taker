# Little notes

A desktop sticky-note board built with React, TypeScript, and native browser interactions. It implements all four core requirements and all five optional features from the Sticky Notes exercise. The UI, drag logic, and resize logic are custom; there are no stock component or drag-and-drop libraries.

## Run locally

Requires Node.js 22.12 or newer and pnpm 10.12.1. The implementation was verified with Node.js 22.16.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the localhost URL printed by Vite. For a production build:

```sh
pnpm build
pnpm preview
```

Use localhost or HTTPS: the mocked API requires a service worker. The API mock is deliberately included in both development and production preview. A real backend is not required. The board still works locally if the worker cannot start.

## Features and controls

| Requirement                             | Implementation                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Create at a specified position and size | **New note** opens a numeric form; **Draw note** lets you drag a rectangle on empty board space.              |
| Resize by dragging                      | Drag the bottom-right corner.                                                                                 |
| Move by dragging                        | Drag the note header.                                                                                         |
| Delete through a trash zone             | Release the pointer over **Let it go** while moving a note. Passing over the target alone does not delete it. |
| Enter and edit text                     | Plain-text textarea, with selection, line breaks, and internal scrolling.                                     |
| Bring notes to the front                | Interacting with or focusing a note raises it.                                                                |
| Restore from local storage              | Committed changes are saved locally, including text, geometry, stacking, and colors.                          |
| Different note colors                   | Yellow, pink, blue, and green, selectable per note.                                                           |
| Save through an asynchronous REST API   | Debounced `fetch` requests intercepted by Mock Service Worker, with latency, status, and retry.               |

Coordinates are whole pixels from the board's top-left corner. Default size is 240 × 200 px; minimum size is 160 × 120 px. Numeric forms reject invalid rectangles. Drawings normalize in any direction, grow to the minimum size when necessary, and stay inside the board; movements shorter than four pixels create nothing.

**Position and size** on each note provides a keyboard-accessible alternative to moving and resizing. Tab reaches controls, Enter activates buttons, Escape closes a dialog or cancels drawing/dragging, and the per-note Delete button provides keyboard deletion. A newly created note receives text focus. Deleting returns focus to New note. Drawing mode ends after one gesture.

Committed notes stay inside the board. Shrinking the viewport fits oversized notes and clamps positions; growing it preserves their current geometry. Escape, pointer cancellation, lost pointer capture, window blur, or a change to the board dimensions cancels an active gesture without committing its geometry. Bringing the note forward remains effective after cancellation.

## Architecture

The note model and geometry module (`src/notes/model.ts`) contain the application's committed data, runtime snapshot validation, pure rectangle operations, and reducer. A note has a stable ID, plain text, color, pixel geometry, and a stacking index. The reducer preserves unchanged note references so memoized note views can avoid unnecessary rendering. React owns the committed state and ordinary UI, including dialogs, status, and focus; TypeScript strict checking is enabled. Snapshots contain only durable note data, not temporary gesture or dialog state.

The gesture module (`src/notes/useGestures.ts`) owns pointer capture, cancellation, coordinate conversion, trash hit testing, and preview cleanup. Its discriminated gesture state separates drawing from operations on an existing note. Transient pointer data stays in refs, and preview styles update at most once per animation frame. React receives one geometry change on release, using the final pointer coordinates. Preview cleanup restores only geometry styles, preserving any stacking change made during interaction. Stable IDs and explicit z-index values avoid DOM reordering while dragging. Native textareas and controls preserve normal editing and keyboard behavior.

The persistence module (`src/notes/persistence.ts`) accepts storage and transport dependencies and exposes start, save, retry, and dispose operations. It handles local recovery, write failures, debounce, request timeout, and ordered asynchronous saving behind that small interface. Only one API request runs at a time; pending edits coalesce into the latest snapshot. Revision tracking prevents stale responses from marking newer edits as saved, and disposal aborts requests and clears timers. The fetch transport validates responses, while MSW provides an independent in-memory mock server. This separation lets logic tests exercise failures and races without rendering React, and browser tests exercise the full user workflow.

## Persistence and API contract

Local storage uses `sticky-notes:v1`, containing `{ schemaVersion: 1, notes: [...] }`. Incoming snapshots must have valid IDs, plain text, supported colors, finite geometry, positive dimensions, and valid stacking values. Unsupported or malformed snapshots are rejected as a whole. Valid restored geometry is fitted to the current board. There is no earlier schema to migrate.

A valid local snapshot, including an empty board, takes precedence and is uploaded on startup. Without one, the app loads from the API. Late loading never replaces edits made while it was in flight. Local writes occur for committed changes; API saves debounce for 500 ms. Drag previews do not write to storage or trigger API saves. Requests time out after 10 seconds. Retry submits the latest snapshot, or retries initial loading if no snapshot exists.

| Endpoint         | Behavior                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/notes` | Returns the current versioned snapshot as JSON.                                                                                              |
| `PUT /api/notes` | Validates and replaces the entire snapshot, returning the accepted snapshot; invalid input returns 400. Deletion is represented by omission. |

The mock adds 400 ms of latency. Its in-memory data resets on page reload; **local storage provides durable recovery**. It is a demonstration of REST saving, not remote backup or multi-device synchronization. If local storage is blocked, the UI warns that notes exist only in the current tab. Even a successful demo API save does not preserve them across reloads.

To reproduce failures, append one of these query strings to the app URL:

- `?mockApi=fail-once`: the first PUT returns 503; Retry succeeds. The scenario resets on reload.
- `?mockApi=offline`: GET and PUT return network errors; editing and available local storage continue working.

Unrelated requests bypass MSW. The generated `public/mockServiceWorker.js` is committed; regenerate it with `pnpm exec msw init public --save` when upgrading MSW.

## Verification

```sh
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm exec playwright install chromium firefox
pnpm test:e2e
pnpm test:e2e:preview
```

The preview suite builds the app and uses port 4174; development tests use port 4173. Preview tests always start a fresh server. Browser traces are retained for failures under the ignored `test-results/` directory.

Branded browser checks require those browsers to be installed:

```sh
pnpm exec playwright test --project=chrome
pnpm exec playwright test --project=edge
# Both installed:
pnpm test:e2e:branded
```

Logic tests cover rectangle normalization and bounds, numeric validation, stacking, snapshot validation, storage exceptions, debounce, in-flight edits, stale loading, retry, timeout, request cancellation, response validation, and mock startup failures. Browser tests cover both creation paths, editing, text selection and scrolling, colors, focus, overlapping notes, movement, resizing, trash deletion, cancellation, reloads, API failure/retry, inaccessible storage, viewport shrink, and 100-note dragging without intermediate storage writes.

Visual checks use both 1440 × 900 and the minimum 1024 × 768 viewport. Supported targets are the latest desktop Chrome on Windows/macOS, Firefox on desktop platforms, and Edge. Below the minimum viewport, the workspace keeps its minimum dimensions and can be scrolled.

### Execution record

Verified on macOS on 2026-10-14:

- 23 logic tests passed.
- All 30 production-preview browser checks passed across Chromium and Playwright Firefox, including the final stacking regression.
- The branded Google Chrome check passed.
- The strict TypeScript production build, ESLint, formatting check, and whitespace check passed.
- Empty and populated boards were visually inspected at 1440 × 900 and 1024 × 768.

Edge is not installed on this machine. Windows, Linux, and stock Firefox platform checks remain unexecuted; passing Chromium is not a claim that those combinations were tested.

For remaining platform checks, run the browser projects above and manually verify text selection, keyboard focus, pointer release outside the board, trash highlighting, viewport shrink, reload recovery, and failure/retry at 1024 × 768. Inspect the console for unexpected errors.

## Scope and tradeoffs

This is a single-user, single-tab exercise. There is no authentication, real backend, multi-tab conflict resolution, undo history, infinite canvas, or mobile-specific interface. The complete agreed feature set was prioritized over the brief's suggested 3–4-hour timebox and six-hour submission cutoff. No application data is sent to an external server.
