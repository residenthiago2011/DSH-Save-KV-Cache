# Installation Guide

Deployment target: DSH `0.2.0-rc.2` on Android (Moto G8) with llama.cpp on a
separate device (Moto G30).

## 1. Copy Plugin Files

Copy the plugin into the DSH app's `node_modules`:

```bash
DSH=/data/local/deepseek-harness
cp -r dsh-save-kv-cache "$DSH/app/node_modules/@deepseek-ai/"
chown -R root:root "$DSH/app/node_modules/@deepseek-ai/dsh-save-kv-cache"
chmod -R 755 "$DSH/app/node_modules/@deepseek-ai/dsh-save-kv-cache"
```

Expected layout:

```
$DSH/app/node_modules/@deepseek-ai/dsh-save-kv-cache/
├── package.json
└── lib/
    ├── index.js
    └── index.js.orig-pre-kvfix   # optional device-side backup
```

## 2. Link Into the Profile

The profile resolves the package through its own `node_modules`:

```bash
mkdir -p "$DSH/home/profiles/web/node_modules/@deepseek-ai"
ln -sfn "$DSH/app/node_modules/@deepseek-ai/dsh-save-kv-cache" \
  "$DSH/home/profiles/web/node_modules/@deepseek-ai/dsh-save-kv-cache"
```

No `cordis-plugin-loader` patch is required with this symlink on DSH
`0.2.0-rc.2`; the deployed loader still contains
`internal = ModuleLoader.fromInternal();` and the plugin loads correctly.
Older DSH (`0.1.x`) needed that line changed to `internal = undefined;`.

## 3. Patch UI Commands (Icons & Labels)

File: `$DSH/app/node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js`

### 3a. Add to `SECTION_ROWS.commands`

```javascript
commands: ["compact", "permission", "model", "export", "save-kv-cache", "load-kv-cache"]
```

### 3b. Add to `BUILTINS`

These values are command `definitionId`s (not import paths):

```javascript
"save-kv-cache": "@deepseek-ai/dsh-save-kv-cache",
"load-kv-cache": "@deepseek-ai/dsh-save-kv-cache/load"
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
    "@deepseek-ai/dsh-save-kv-cache": "*"
  }
}
```

### 4b. `profiles/web/cordis.patch.yml`

```yaml
- insert:
    - id: save-kv-cache
      name: '@deepseek-ai/dsh-save-kv-cache'
```

The deployed profile also disables `hmr` and `office-to-pdf`, binds the
webserver to `0.0.0.0:3080`, and defines the `llm-pi-ai` providers. The plugin
uses the **active** provider from the session's latest request header (or
`model/selection` event), not the first provider in `llm-pi-ai.providers`.

## 5. Configure the llama.cpp Server

Start the model server with a slot save directory:

```bash
llama-server -m /data/local/tmp/llama/model.gguf \
  --host 0.0.0.0 --port 11434 \
  --slot-save-path /data/local/tmp/llama/kv-slots
```

The deployed G30 uses:

```
--slot-save-path /data/local/tmp/llama/kv-slots-bonsai
```

The G8's local llama.cpp on port `8081` is started **without**
`--slot-save-path`, so saving against the `laya` provider fails with HTTP 400.

## 6. Configure DSH Settings

`settings.yaml` / `cordis.patch.yml` must expose an `llm-pi-ai` entry for every
llama.cpp server you use. The provider selected in the DSH model picker is the
one the plugin talks to:

```yaml
llm-pi-ai:
  providers:
    moto-g30:
      baseURL: http://192.168.1.68:11434/v1
      models:
        - id: /data/local/tmp/llama/Ternary-Bonsai-2-2B-PQ2_0.gguf
    desktop:
      baseURL: http://192.168.1.65:11434
      models:
        - id: I:\Language-Models\Prism-ML\4B\Ternary-Bonsai-2-4B-Q2_0.gguf
```

The provider whose model is active must be reachable from the G8, and its
llama.cpp process must have `--slot-save-path` configured.

## 7. Restart DSH

```bash
adb -s <device> shell su 0 sh /data/local/deepseek-harness/start-dsh.sh
```

## Verification

After restart, type `/` in DSH. You should see:

- **Save Session** — download icon
- **Load Session** — data icon

Saved caches land in the **active** server's slot directory. For the Moto G30:

```bash
adb -s ZF523HDBQQ shell ls -la /data/local/tmp/llama/kv-slots-bonsai
```

For the desktop provider, check its configured save directory, for example:

```powershell
Get-ChildItem 'I:\Language-Models\Prism-ML\4B\KV-Cache'
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
