# Pages

The server renders HTML pages as well as the JSON API. A page is built on the server, streamed to the
browser, and brought to life there only where it is interactive.

## What you write

Pages are [Solid](https://v2.solidjs.com) components; styles are
[Panda CSS](https://panda-css.com), compiled to plain CSS at build time. Both live in the `src/` folder:

| Folder       | What it holds                                                                       |
| ------------ | ------------------------------------------------------------------------------------ |
| `src/pages/` | Route modules. The filename is the path: `index.tsx` serves `/`, `users.tsx` serves `/users` |
| `src/styles/`| Modules whose `css()` calls become class names the pages put on their elements        |
| `src/assets/`| `global.css`: the cascade-layer order, and where Panda writes the generated styles    |

Design tokens live in `panda.config.ts` (`semanticTokens`); a color, spacing, radius or font used
through its token name keeps every page consistent, and rebranding is a config change.

Routing is file-based ([Solid Router](https://v2.solidjs.com/routing/solid-router)): the folder is
scanned and each module's default export becomes its page. A page that loads its own data declares it
with `defineFileRoute`. The user list on `/users`, for example, loads from the server over a small RPC
call and filters as you type:

```tsx
const [query, setQuery] = createSignal('')
const users = listUsers({}) // one typed call to /rpc

<input value={query()} onInput={(e) => setQuery(e.currentTarget.value)} />
```

## Adding a page

1. Write the route module in `src/pages/` — the filename is the URL — and any styles it needs as
   `css()` calls in `src/styles/`.
2. Load its data from `/rpc`: a procedure over the same services as the API, so a page and its
   endpoint cannot disagree.
3. Wire it where the other pages are registered, if it needs server-side work. `GET /users` is the
   worked example.

Pages answer in HTML, and so do their errors: a bad query, a missing record or a server error shows an
error page (`src/pages/error-page.tsx`) with the status, a short message and the request ID, while the
same failure under `/api` is JSON. The front page is `src/pages/index.tsx`, served at `/`.

## Working on pages

```bash
pnpm dev          # the server and the pages, on one port
```

Editing a page or a style updates the open browser tab without a reload. Editing server code starts the
application over (a second or less) and reloads the page. `pnpm typecheck` also checks the pages, so a
misspelled field fails there and not in the browser.

## How pages are served

| Where                       | What happens                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm dev`                  | Vite serves scripts and styles from the source folders                               |
| Node.js build               | The server serves the built files under `/assets`; a file's name carries its content hash, so browsers keep it for a year |
| Single executable           | The built files are inside the executable                                            |
| Cloudflare Workers          | Cloudflare serves `/assets` itself, before the Worker runs                           |

Pages carry their own content security policy: scripts and styles from the same site only. The page's
scripts are external module files, so nothing needs to be allowed inline.
