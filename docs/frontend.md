# Pages

The server renders HTML pages as well as the JSON API. A page is built on the server, streamed to the
browser, and brought to life there only where it is interactive.

## What you write

Pages are [SolidJS](https://solidjs.com) components; styles are TypeScript, compiled to plain CSS at
build time by [StyleX](https://stylexjs.com). Routes are file-based:

| Where                           | What it holds                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `src/routes/`                   | One component file per URL. `users/[id].tsx` answers `/users/:id`                       |
| `src/routes/(app)/`             | A route group: a sibling layout file (for example `users.tsx`) wraps the folder's pages |
| `src/routes/(app)/[...404].tsx` | The catch-all page for unknown URLs                                                     |
| `src/resources/styles/pages/`   | The StyleX styles a page uses, one file per page                                        |
| `src/resources/styles/core/`    | The design tokens, colors, and shared utility styles (`fx`)                             |
| `src/resources/components/`     | Components shared across pages                                                          |

Styles apply through the `sx` prop helper (`src/resources/styles/props.ts`): pass the style objects a
StyleX file exports, and the compiler extracts the CSS and hands back stable class names.

```tsx
<h2 {...sx(fx.h2, userStyles.detailTitle)}>{user().name}</h2>
```

## Adding a page

1. Add a component file under `src/routes/`; the file path becomes the URL.
2. Write the styles it needs in `src/resources/styles/pages/` and apply them with `sx`.
3. Load its data through the typed client functions in `src/modules/user/user_fn.ts` (or add a sibling
   function there) so a page and its API endpoint cannot disagree.

## Data and not-found states

Page data loads through `@solidjs/router`'s `query` wrappers over the same client functions the
browser uses; on the server the calls resolve against the application services directly, so a page
never invents a second transport. A lookup that finds nothing returns `undefined` — render a
not-found branch for it (the user detail page is the worked example), and the catch-all route covers
unknown URLs.

## Working on pages

```bash
vpr dev
```

Editing a component or a style updates the open browser tab without a reload. Editing server code
restarts the application (about a second) and reloads the page. `vpr typecheck` also checks the
components, so a misspelled field fails there and not in the browser.

## How pages are served

| Where             | What happens                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `vpr dev`         | Vite serves scripts and styles from the source folders                                                                    |
| Node.js build     | The server serves the built files under `/assets`; a file's name carries its content hash, so browsers keep it for a year |
| Single executable | The built files are inside the executable                                                                                 |
