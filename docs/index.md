# Documentation Index

Human-facing documentation for the Edgy reference server.

| Document                            | What it covers                                            |
| ----------------------------------- | --------------------------------------------------------- |
| [Getting started](../README.md)     | What the project is, requirements, first run              |
| [CLI](./commandline.md)             | Commands, flags, confirmation and dry-run behaviour       |
| [Configuration](./configuration.md) | Environment variables, defaults, examples                 |
| [API endpoints](./api-endpoint.md)  | Endpoint list, request ID tracing, error response shapes  |
| [Pages](./frontend.md)              | Writing a page, styling, how pages are served             |
| [Development](./development.md)     | Day-to-day commands, database workflow, validation        |
| [Deployment](./deployment.md)       | Node.js and Cloudflare Workers targets, bundling, scaling |

## Reading order by goal

- **Run it locally for the first time** — README (getting started) → [Configuration](./configuration.md)
- **Work on the code** — [Development](./development.md) → [CLI](./commandline.md)
- **Build a page** — [Pages](./frontend.md) → [Development](./development.md)
- **Ship it** — [Deployment](./deployment.md) → [Configuration](./configuration.md)
- **Try it on Cloudflare Workers** — [Development](./development.md#cloudflare-workers-locally) → [Deployment](./deployment.md#cloudflare-workers)
- **Integrate with it** — [API endpoints](./api-endpoint.md)
