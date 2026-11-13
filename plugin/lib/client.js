// Client half of @residenthiago/dsh-save-kv-cache.
//
// DSH 0.2.2-rc.1 has no supported way to give a third-party HOST command a
// menu face. `ctx.commandUi.register()` throws for a name that already exists
// in the host catalog ("contribution /x collides with a host command"), and
// `ctx.commandUi.decorate()` only replaces bare-invocation dispatch — the row
// face still comes from the first-party HOST_FACES map, which knows six
// definitionIds and nothing else. Upstream discussion #10143 asks for a
// `ctx.commandUi.face()` surface and is unimplemented.
//
// So this bundle extends the one client hook that actually builds the rows —
// `ctx.commandUi.candidates` — and adds label/description/icon for the two
// commands this plugin registers host-side. Dispatch is untouched: the host
// commands keep their catalog row, their argument claim, and their lifecycle.
//
// The file is authored directly in the `window.__ModuleLoader__` client-bundle
// format (the shape tsdown emits for first-party `lib/client.js`). The bundle
// is served at runtime from node_modules, so it survives a harness
// `node_modules` rebuild — the failure mode that destroyed the old hand patch.
window.__ModuleLoader__.load({
	id: "@residenthiago/dsh-save-kv-cache",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// The platform seed table is versioned with the shell, but a missing
		// icon set must not take the whole client half down with it.
		let primitives = {};
		try {
			primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		} catch {
			primitives = {};
		}

		const name = "save-kv-cache";
		const inject = ["commandUi", "locale"];

		// Copy matches what the harness patch used to install (INSTALL.md §3d).
		const DICTIONARIES = {
			en: {
				"label.save-kv-cache": "Save Session",
				"label.load-kv-cache": "Load Session",
				"description.save-kv-cache": "Save KV cache slot to disk on llama.cpp server",
				"description.load-kv-cache": "Load a saved KV cache from file into the current session"
			},
			zh: {
				"label.save-kv-cache": "保存会话",
				"label.load-kv-cache": "加载会话",
				"description.save-kv-cache": "保存 KV 缓存到 llama.cpp 服务器",
				"description.load-kv-cache": "从文件加载 KV 缓存到当前会话"
			}
		};

		const FACES = {
			"save-kv-cache": {
				label: "label.save-kv-cache",
				description: "description.save-kv-cache",
				icon: primitives.IconDownloadOutlineRegular
			},
			"load-kv-cache": {
				label: "label.load-kv-cache",
				description: "description.load-kv-cache",
				icon: primitives.IconDataOutlineRegular
			}
		};

		// Instance guard: a re-applied plugin must not wrap the wrapper.
		const GUARD = "__residenthiagoSaveKvCacheFaces";

		function apply(ctx) {
			const service = ctx.get("commandUi");
			if (service === undefined || typeof service.candidates !== "function") {
				const logger = ctx.get("logger");
				if (logger !== undefined && typeof logger.warn === "function") {
					logger.warn("save-kv-cache: commandUi service unavailable; command faces not installed");
				}
				return;
			}
			if (service[GUARD] === true) return;

			// English is the fallback chain's terminal locale, so an absent
			// locale service still renders the same copy the patch installed.
			let t = (key) => {
				const value = DICTIONARIES.en[key];
				return value !== undefined ? value : key;
			};
			const locale = ctx.get("locale");
			if (locale !== undefined && typeof locale.register === "function" && typeof locale.bind === "function") {
				try {
					locale.register(name, DICTIONARIES);
					const bound = locale.bind(name);
					t = (key) => bound(key);
				} catch {
					// Already registered (re-apply) — the dictionaries stand.
				}
			}

			const original = service.candidates;
			service.candidates = function (session, req) {
				return original.call(this, session, req).then((rows) => {
					for (const row of rows) {
						const face = FACES[row.name];
						if (face === undefined) continue;
						row.label = t(face.label);
						row.description = t(face.description);
						row.icon = face.icon;
					}
					// Runs after the original's own rankByName pass, so a query that
					// only matches the localized title ("/session") no longer finds
					// the row; name-based queries ("/save", "/load") are unaffected.
					return rows;
				});
			};
			service[GUARD] = true;
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
