# @residenthiago/dsh-save-kv-cache

Save and load KV cache slots on a llama.cpp server from within
[DeepSeek Harness](https://github.com/tonyd2wild/DeepSeek-Harness).

- **`/save-kv-cache`** — save the active slot as `session-<id>.bin`.
- **`/load-kv-cache`** — restore a saved slot file.
- **Auto-save** — fires on every `turn/end` for the session's active provider.
- **Capability probe** — servers without `--slot-save-path` are detected once
  (10-minute cache): auto-save stays dormant and the manual commands answer
  with the fix instead of a raw 404.
- **Plugin panel** — ships `dsh.bundle.patch` + `locale/en|zh.json` +
  `icon.svg`, so Plugins lists it under **Personal** as "Save KV-Cache" with
  the standard enable/disable toggle.

## Install

```sh
dsh plugin --profile <profile> add @residenthiago/dsh-save-kv-cache
```

Then select the bundle on the Plugins page (installation enables it by
default) and restart DSH if the profile runs without HMR.

## Requirements

- DeepSeek Harness (DSH) `0.2.0-rc.2+`
- llama.cpp server started with `--slot-save-path` (otherwise the plugin stays
  dormant by design)

## Development

Full documentation — how the commands and the probe work, provider selection,
filename rules, and device deployment — lives in the repository's
[README](https://github.com/residenthiago2011/DSH-Save-KV-Cache#readme) and
[INSTALL.md](https://github.com/residenthiago2011/DSH-Save-KV-Cache/blob/main/INSTALL.md).

```sh
npm test    # module shape + command registration (node --test)
```

## License

MIT — see `LICENSE`.
