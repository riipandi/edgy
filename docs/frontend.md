# Pages

The server renders HTML pages as well as the JSON API. A page is built on the server, streamed to the
browser, and brought to life there only where it is interactive.

## What you write

Pages are [Marko](https://markojs.com) templates; styles are TypeScript, compiled to plain CSS at build
time by [vanilla-extract](https://vanilla-extract.style). Both live in the `app/` folder:

| Folder          | What it holds                                                                     |
| --------------- | --------------------------------------------------------------------------------- |
| `app/pages/`    | One template per page                                                             |
| `app/tags/`     | Components. A file named `user-list.marko` is available as `<user-list>` everywhere |
| `app/styles/`   | `*.css.ts` files: the design tokens (`theme.css.ts`) and the styles that use them  |

A component is interactive when it has state. The user list on `/users`, for example, filters the list
as you type; the rest of the page is static HTML and sends no script.

```marko
<let/query="">
<input value:=query placeholder="Filter users">
```

## Adding a page

1. Write the template in `app/pages/`, and the styles it needs in `app/styles/`.
2. Declare what it shows: an Effect that loads the data, and the template that renders it. The data comes
   from the same services as the API, so a page and its endpoint cannot disagree.
3. Give it a route group and register it with the other pages. `GET /users` is the worked example.

Pages answer in HTML. A request that fails (a bad query, a missing record, a server error) is answered
in the JSON error format the API uses, not as a page.

## Working on pages

```bash
pnpm dev          # the server and the pages, on one port
```

Editing a template or a style updates the open browser tab without a reload. Editing server code
restarts the process, as it always did. `pnpm typecheck` also checks the templates, so a misspelled
field fails there and not in the browser.

## How pages are served

| Where                       | What happens                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm dev`                  | Vite serves scripts and styles from the source folders                               |
| Node.js build               | The server serves the built files under `/assets`; a file's name carries its content hash, so browsers keep it for a year |
| Single executable           | The built files are inside the executable                                            |
| Cloudflare Workers          | Cloudflare serves `/assets` itself, before the Worker runs                           |

Pages carry their own content security policy: scripts and styles from the same site only, plus the
one inline script Marko needs, allowed by a per-response nonce. Because of the nonce, a page is never
cached by a shared cache.
