# Changelog

All notable changes to the **Save KV-Cache** plugin
(`@residenthiago/dsh-save-kv-cache`) are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [SemVer](https://semver.org/).

## 0.2.0-alpha.2 — 2026-11-11

### Fixed
- **Probe no longer transmits a sentinel filename.** The capability probe used
  to `POST /slots/0?action=restore` with `{"filename":"__dsh_probe__.bin"}`,
  which leaked an internal name onto the wire (it read like an unresolved
  variable in any packet capture). The probe now posts an **empty body `{}`**:
  llama.cpp answers `501 not_supported_error` when `--slot-save-path` is
  missing and a JSON error when the endpoint exists, so no filename is ever
  transmitted. An empty-filename restore writes nothing.
- **False "supported" verdict eliminated.** Previously any answer that was not
  a `501` and not a matching `404` counted as slot support. A public endpoint
  answering every path with `200 HTML` was declared capable and then received
  real `POST /slots/0?action=save` requests, with `requestJson()` reporting
  *"KV cache slot … saved"* although nothing was saved. Now:
  - only a **JSON response** counts as supported (HTML/empty bodies are
    unsupported);
  - router-style `404`s without llama.cpp's `not_found_error` type are
    unsupported;
  - a non-JSON `200` on an actual save/restore raises an honest error
    (`unexpected non-JSON response`) instead of reporting success.
- **Remote/third-party endpoints are never probed or written to.** Slots are a
  disk feature of a llama-server you control; the plugin now refuses slot
  commands on any `baseURL` that is not loopback or LAN (private IPv4 ranges,
  `*.local`, bare LAN hostnames). Manual commands return a clear error;
  auto-save silently skips. Fixes: probe/saves mailing internal filenames to a
  remote provider (`tokenharbor.ai` in the reported setup) and the
  first-provider fallback reaching an arbitrary remote host.

### Changed
- Error details from slot requests are truncated to 300 characters.
- Documented that `new URL("/slots/…", baseURL)` intentionally drops a `/v1`
  prefix: llama.cpp slot endpoints live at the server root, not under
  `/v1/chat-completions`.

### Notes
- The probe still proves **both** actions: llama.cpp gates save and restore
  behind the same `--slot-save-path` flag, so one empty restore probe covers
  both.
- Deployment on the target device replaced all three live package-resolution
  copies under the profile's `.pnpm` store (local-tarball + two GitHub-tarball
  resolutions), with `index.js.bak-preAlpha2-20261111` backups; DSH restarted
  and the module import verified.

## 0.2.0-alpha.1 — 2026-11-02

### Added
- **Slot capability probe** (10-minute per-`baseURL` cache): before saving, the
  plugin checks whether the server actually serves slots. On servers started
  without `--slot-save-path` (501 `not_supported_error`) auto-save goes
  **dormant** instead of posting blind 404s at every `turn/end`, and the
  manual commands answer with the fix
  ("start llama-server with `--slot-save-path`") instead of a raw error.
- **Plugin panel support**: `dsh.bundle.patch` + `locale/en|zh.json` +
  `icon.svg`, so DSH lists the plugin under **Personal** as "Save KV-Cache"
  with the standard enable/disable toggle.

## Earlier fixes (pre-release, device backup era)

Documented from the historical device copies (`index.js.orig-pre-kvfix`,
`index.js.orig-pre-routefix-20261020`, `bak-preProbe`); exact versions were
never tagged.

### 2026-10-20 — provider routing fix
- Manual commands and auto-save resolved the provider from the session's
  latest `request/header` (or `model/selection` event) instead of always using
  the first configured provider — necessary when more than one llama.cpp
  server is configured, since saving against the wrong server writes an
  unrelated slot cache.

### Pre-kvfix — slot endpoint fix
- Replaced the old `/v1/chat/completions` + string `slot_id` path (which never
  restored anything) with `POST /slots/{id}?action=save|restore` carrying
  `{"filename": …}`, reporting `n_saved`/`n_written`/`n_restored`/`n_read` and
  the `timings` fields from the server response.

### Pre-probe
- The era before 0.2.0-alpha.1: auto-save fired blind `POST`s at every
  `turn/end` with no capability check.
