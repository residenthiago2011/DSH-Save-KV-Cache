# DeepSeek Harness - Save KV-Cache

Save and load KV cache slots on a llama.cpp server from within DeepSeek Harness (DSH).

> Version history and fix notes live in [CHANGELOG.md](CHANGELOG.md).

## Features

- **`/save-kv-cache`** — Save the current KV cache slot on the active llama.cpp server as `session-<id>.bin`. Download icon.
- **`/load-kv-cache`** — Restore a saved KV cache file on the active llama.cpp server. Data icon.
- **Auto-save** — Fires on every `turn/end` event and saves slot `0` as `session-<id>.bin`.
- **Capability probe** — Before saving, the plugin probes the slot endpoint once per server
  (10-minute cache) with an **empty** `POST /slots/0?action=restore` body `{}` — no filename is
  ever transmitted. On servers without `--slot-save-path` (501 `not_supported_error`) auto-save
  stays **dormant** — no blind POST traffic at every turn — and the manual commands answer with
  the fix ("start llama-server with `--slot-save-path`") instead of a raw `404 The model 'None'
  does not exist`. Only a JSON answer counts as supported, and **remote/third-party endpoints
  are never probed or written to** (slots exist only on a llama-server on loopback/LAN), so a
  hosted API that answers every path with `200 HTML` can no longer be mistaken for a
  slot-capable server.
- **Plugin panel** — Ships `dsh.bundle.patch` + `locale/en|zh.json` + `icon.svg`, so Plugins lists it
  under **Personal** as "Save KV-Cache" (保存 KV 缓存) with the same enable/disable toggle as the
  built-in plugins.
- **Menu face (client half)** — Ships a `dsh.client` bundle (`lib/client.js`) that gives both
  commands their `/` menu label, description, and glyph on DSH `0.2.2-rc.1`, where the harness only
  assigns faces to first-party commands. It is served from `node_modules` at runtime, so it survives
  a harness `node_modules` rebuild.

## Menu Face

DSH `0.2.2-rc.1` builds `/` menu rows through `builtinRowFace()`, which only knows six first-party
`definitionId`s; every other host command falls through to `{ description }` and renders with an
empty glyph. A client contribution cannot be used instead — `ctx.commandUi.register()` throws
`contribution /<name> collides with a host command` when the name is already a host command, and
`ctx.commandUi.decorate()` changes only bare-invocation dispatch, never the row face. There is no
face API in `0.2.2-rc.1` or `rc.2` (upstream discussion
[#10143](https://github.com/deepseek-ai/deepseek-harness/discussions/10143) requests one and is
unimplemented).

So the plugin ships a small client bundle that extends the one hook which actually builds the rows —
`ctx.commandUi.candidates` — and adds `label`, `description`, and `icon` for `save-kv-cache` and
`load-kv-cache`. Dispatch is untouched: the host commands keep their catalog row, their argument
claim, and their lifecycle logging. The bundle is authored directly in the
`window.__ModuleLoader__` format tsdown emits for first-party `lib/client.js` and is served from
`node_modules` at runtime, so a harness upgrade that rebuilds `node_modules` no longer removes it.

## How It Works

### Save

```
POST /slots/{slot_id}?action=save
Body: { "filename": "session-<id>.bin" }
```

The llama.cpp server writes the KV cache from the specified slot into `--slot-save-path`.

### Load

```
POST /slots/{slot_id}?action=restore
Body: { "filename": "session-<id>.bin" }
```

The server restores the saved sequence state into the slot. The command reports
`n_restored`, `n_read`, and `restore_ms` from the server response.

### Provider selection

Commands and auto-save resolve the **active provider** from the session's latest
`request/header` (or `model/selection` event), then read that provider's
`baseURL` from `llm-pi-ai.providers`. This is important when more than one
llama.cpp server is configured: saving against the wrong server writes an
unrelated slot cache. The first configured provider is used only when no
selection exists yet.

## Commands

| Command | Description |
|---------|-------------|
| `/save-kv-cache` | Save KV cache as `session-<id>.bin` |
| `/load-kv-cache` | Restore KV cache from `session-<id>.bin` |
| Auto-save | Saves slot `0` on every `turn/end` using the active provider |

## Filenames

The code tries `session.title`, then falls back to `String(session.id)`. In DSH
`0.2.0-rc.2` the title is a session event (`session/title`), not a property on the
session object, so the effective filename is the session ID (e.g.
`session-<session-uuid>.bin`).

## Requirements

- DeepSeek Harness (DSH) `0.2.0-rc.2+`
- llama.cpp server with `--slot-save-path` configured
- Plugin installed in the profile's `node_modules` (see INSTALL.md)

## Installation

From npm:

```sh
dsh plugin --profile <profile> add @residenthiago/dsh-save-kv-cache
```

Device-specific deployment (manual copy/symlink, profile bundle wiring):
see [INSTALL.md](INSTALL.md).

## Repository layout

The npm package lives in [`plugin/`](plugin) (`package.json`, `lib/`,
`locale/`, bundle patch, package README/LICENSE, `test/`); this root holds the
full documentation — this README, [INSTALL.md](INSTALL.md), and
[CHANGELOG.md](CHANGELOG.md).
