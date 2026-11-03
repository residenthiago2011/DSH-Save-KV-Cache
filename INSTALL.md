# Installation Guide

Deployment target: DSH `0.2.0-rc.2` on Android, with llama.cpp running on the
same host or a separate one.

## 1. Copy Plugin Files

Copy the plugin into the DSH app's `node_modules`:

```bash
DSH=/path/to/dsh-install
cp -r dsh-save-kv-cache "$DSH/app/node_modules/@residenthiago/"
chown -R root:root "$DSH/app/node_modules/@residenthiago/dsh-save-kv-cache"
chmod -R 755 "$DSH/app/node_modules/@residenthiago/dsh-save-kv-cache"
```

Expected layout:

```
$DSH/app/node_modules/@residenthiago/dsh-save-kv-cache/
├── package.json
└── lib/
    ├── index.js
    └── index.js.orig-pre-kvfix   # optional device-side backup
```

## 2. Link Into the Profile

The profile resolves the package through its own `node_modules`:

```bash
mkdir -p "$DSH/home/profiles/web/node_modules/@residenthiago"
ln -sfn "$DSH/app/node_modules/@residenthiago/dsh-save-kv-cache" \
  "$DSH/home/profiles/web/node_modules/@residenthiago/dsh-save-kv-cache"
```

No `cordis-plugin-loader` patch is required with this symlink on DSH
`0.2.0-rc.2`; the deployed loader still contains
`internal = ModuleLoader.fromInternal();` and the plugin loads correctly.
Older DSH (`0.1.x`) needed that line changed to `internal = undefined;`.

## 2b. Bundle Install (Plugin Panel) — dsh 0.2.1-rc.3+

The plugin is also a **bundle**: its `package.json` declares
`dsh.bundle.patch → ./cordis.patch.yml`, so instead of the manual edits in
§3–§4 you can install it the way the Plugins page does:

1. Make the package a dependency of the profile
   (`profiles/web/package.json` → `"@residenthiago/dsh-save-kv-cache": "*"`
   with the package present under `profiles/web/node_modules/`).
2. Select it in the manifest:
   `{ "dsh": { "profile": { "bundles": ["@residenthiago/dsh-save-kv-cache"] } } }`
   (the bundle's own `cordis.patch.yml` then supplies the
   `- id: save-kv-cache` row — do **not** also add that row to the profile
   patch, duplicate ids conflict).
3. Restart DSH.

With the bundle metadata in place the Plugins page lists it under **Personal**
(display name "Save KV-Cache" from `locale/en|zh.json`, `meta.title`) with the
same enable/disable toggle the built-ins have: toggling writes the profile
bundle selection, and per-row switches write `disabled` flags onto the ledger.

The plugin manager silently drops profile dependencies that lack
`dsh.bundle.patch` — a plain config-row install keeps running but stays
invisible to the panel.

## 3. Patch UI Commands (Icons & Labels)

File: `$DSH/app/node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js`

### 3a. Add to `SECTION_ROWS.commands`

```javascript
commands: ["compact", "permission", "model", "export", "save-kv-cache", "load-kv-cache"]
```

### 3b. Add to `BUILTINS`

These values are command `definitionId`s (not import paths):

```javascript
"save-kv-cache": "@residenthiago/dsh-save-kv-cache",
"load-kv-cache": "@residenthiago/dsh-save-kv-cache/load"
```

### 3c. Add to `HOST_FACES`

```javascript
hostFace("save-kv-cache", IconDownloadOutlineRegular),
hostFace("load-kv-cache", IconDataOutlineRegular)
```

Both icons are imported from `@deepseek-ai/dsh-client-ui-primitives`.

### 3d. Add locale strings (Chinese + English)

```javascript
// Chinese:
"label.save-kv-cache": "保存会话",
"label.load-kv-cache": "加载会话",
"description.save-kv-cache": "保存 KV 缓存到 llama.cpp 服务器",
"description.load-kv-cache": "从文件加载 KV 缓存到当前会话"

// English:
"label.save-kv-cache": "Save Session",
"label.load-kv-cache": "Load Session",
"description.save-kv-cache": "Save KV cache slot to disk on llama.cpp server",
"description.load-kv-cache": "Load a saved KV cache from file into the current session"
```

## 4. Configure the DSH Profile

### 4a. `profiles/web/package.json`

```json
{
  "dependencies": {
    "@residenthiago/dsh-save-kv-cache": "*"
  }
}
```

### 4b. `profiles/web/cordis.patch.yml`

Legacy row insert (bundle install from §2b supplies this row itself — skip it
there to avoid duplicate ids):

```yaml
- insert:
    - id: save-kv-cache
      name: '@residenthiago/dsh-save-kv-cache'
```

The profile typically also disables `hmr` and `office-to-pdf`, binds the
webserver to a LAN address, and defines the `llm-pi-ai` providers. The plugin
uses the **active** provider from the session's latest request header (or
`model/selection` event), not the first provider in `llm-pi-ai.providers`.

## 5. Configure the llama.cpp Server

Start the model server with a slot save directory:

```bash
llama-server -m /path/to/model.gguf \
  --host 0.0.0.0 --port 11434 \
  --slot-save-path /path/to/kv-slots
```

Give each server/model its own slot directory (e.g. `kv-slots-<model>`) so
caches from different servers never collide.

A server started **without** `--slot-save-path` has no writable `/slots`
endpoint: `POST /slots/0?action=save` answers `501 not_supported_error`, and
the plugin's capability probe keeps auto-save dormant there (the manual
commands report the fix instead of a raw error).

## 6. Configure DSH Settings

`settings.yaml` / `cordis.patch.yml` must expose an `llm-pi-ai` entry for every
llama.cpp server you use. The provider selected in the DSH model picker is the
one the plugin talks to:

```yaml
llm-pi-ai:
  providers:
    llama-remote:
      baseURL: http://<server-host-or-ip>:11434/v1
      models:
        - id: /path/to/model.gguf
    llama-desktop:
      baseURL: http://<host>:11434
      models:
        - id: C:\path\to\model.gguf
```

The provider whose model is active must be reachable from the host running
DSH, and its llama.cpp process must have `--slot-save-path` configured.

## 7. Restart DSH

Restart the DSH service however your deployment starts it, e.g.:

```bash
sh /path/to/dsh-install/start-dsh.sh
```

## Verification

After restart, type `/` in DSH. You should see:

- **Save Session** — download icon
- **Load Session** — data icon

Saved caches land in the **active** server's slot directory:

```bash
ls -la /path/to/kv-slots
```

On a Windows host, check the configured save directory, for example:

```powershell
Get-ChildItem 'C:\path\to\KV-Cache'
```

Expected names are `session-<session-id>.bin` (titles are not resolved on DSH
`0.2.0-rc.2`). Manual save and auto-save use the same filename, so a later
`turn/end` auto-save replaces an earlier manual snapshot for that session.

## Notes

- `/load-kv-cache` restores through `POST /slots/{id}?action=restore`; the old
  `/v1/chat/completions` + string `slot_id` path never restored anything.
- The command reports the active provider and base URL in its success message,
  which makes it obvious which server received the request.
- If the active provider has no `baseURL`, or no selection exists yet, the
  command fails instead of silently writing to a different server.
