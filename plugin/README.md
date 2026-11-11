# Save KV-Cache

Save and load KV cache slots on a llama.cpp server from within
[DeepSeek Harness](https://github.com/tonyd2wild/DeepSeek-Harness).

- **`/save-kv-cache`** — save the active slot as `session-<id>.bin`.
- **`/load-kv-cache`** — restore a saved slot file.
- **Auto-save** — fires on every `turn/end` for the session's active provider.
- **Capability probe** — servers without `--slot-save-path` are detected once
  (10-minute cache, empty-body POST): auto-save stays dormant and the manual
  commands answer with the fix instead of a raw 404. Only JSON answers count as
  supported, and remote/third-party endpoints are never probed or saved to.
- **Plugin panel** — ships `dsh.bundle.patch` + `locale/en|zh.json` +
  `icon.svg`, so Plugins lists it under **Personal** as "Save KV-Cache" with
  the standard enable/disable toggle.

## Install

### From a GitHub Release (plugin panel / tarball URL)

DeepSeek Harness → **Plugins** → **Add plugin** → Registry: **Official npm
registry** → paste:

```text
https://github.com/residenthiago2011/DSH-Save-KV-Cache/releases/download/v0.2.0-alpha.1/residenthiago-dsh-save-kv-cache-0.2.0-alpha.1.tgz
```

Pick the newest tag from the
[Releases page](https://github.com/residenthiago2011/DSH-Save-KV-Cache/releases);
each release also carries a `SHA256SUMS.txt` for `sha256sum -c`. To remove the
plugin later, open its card → **Uninstall** (the profile must run with HMR
enabled for the panel uninstall; otherwise use `dsh plugin remove`).

### From a registry package

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
Version history and fix notes: repository
[CHANGELOG.md](https://github.com/residenthiago2011/DSH-Save-KV-Cache/blob/main/CHANGELOG.md).

```sh
npm test    # module shape + command registration (node --test)
```

## License

MIT — see `LICENSE`.
