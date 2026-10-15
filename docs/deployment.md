# Deployment

How to build, bundle, and ship the server.

## Building

The `builder/` directory is a small Rolldown pipeline, deliberately independent of the server
source. It bundles the server, keeps native packages external, traces them into the output, and
emits a minimal `package.json` so the result runs without the project's own `node_modules`.

```bash
pnpm build       # -> dist/server  (ESM bundle + chunks)
pnpm compile     # -> dist/server + dist/edgy  (single executable, experimental)
```

Flags apply to both commands:

```bash
pnpm build --no-splitting          # one self-contained index.mjs
pnpm build --minify                # minify with Rolldown's oxc minifier
pnpm build --obfuscate             # obfuscate chunks (javascript-obfuscator)
pnpm build --minify --obfuscate    # both
```

Run the bundle anywhere, with no `node_modules` present:

```bash
node dist/server/index.mjs serve
```

## Build configuration

`builder/builder.config.ts` is optional; every field has a sensible default. Common options:

| Option            | Default             | Description                                                  |
| ----------------- | ------------------- | ------------------------------------------------------------ |
| `entry`           | `src/main.ts`       | Server entry point                                           |
| `outDir`          | `dist`              | Build output root                                            |
| `splitting`       | `true`              | Split shared code into chunks                                |
| `splitPackages`   | `true`              | One chunk per dependency instead of a single `vendor` chunk  |
| `chunkGroups`     | `[]`                | Extra chunk groups (e.g. group `effect` separately)          |
| `minify`          | `false`             | Minify the bundles                                           |
| `obfuscate`       | `false`             | Obfuscate the bundles                                        |
| `external`        | native packages     | Packages kept external and traced into the output            |
| `seaConfig`       | `{ enable: false }` | Single executable options (see below)                        |
| `rolldownOptions` | `{}`                | Escape hatch, deep-merged over the builder's Rolldown config |

> [!TIP]
> `rolldownOptions` is merged (arrays concatenate), so extra plugins append instead of replacing
> the builder's externals plugin:
>
> ```ts
> rolldownOptions: {
>   resolve: { alias: { '#': './src' } },
>   output: { comments: false }
> }
> ```

## Single executable

`pnpm compile` bundles the server as one CommonJS file, generates a preparation blob with
`node --experimental-sea-config`, and injects it into a copy of the running `node` binary using
[postject](https://github.com/nodejs/postject).

```bash
pnpm compile
./dist/edgy serve
```

The compiler is driven by `seaConfig` in `builder.config.ts`:

```ts
seaConfig: {
  enable: false,                      // set by the `compile` command
  fileName: 'edgy',                   // -> dist/edgy (.exe on Windows)
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  useSnapshot: false,
  execArgv: [],
  execArgvExtension: 'env',           // 'none' | 'env' | 'cli'
  assets: {},                         // key -> path, readable via node:sea
  target: undefined                   // e.g. 'linux-x64'; defaults to the host
}
```

> [!IMPORTANT]
> Node marks Single Executable Applications as **experimental** (stability 1.1). The generated
> binary:
>
> - embeds the Node runtime, so expect **~120 MB**;
> - **cannot be cross-compiled** — it only runs on the platform that built it;
> - is supported on Windows, macOS (arm64) and Linux (except Alpine and s390x).
>
> On macOS the compiler strips and re-signs the binary ad-hoc around the injection step; if there
> are external native addons, embed them through `seaConfig.assets` and load them with
> `process.dlopen`. This project uses `node:sqlite`, so the output has no external dependencies.
