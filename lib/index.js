const name = "save-kv-cache";
const inject = ["commands"];

// --- slot capability probe (added 2026-11-02) --------------------------------
// llama.cpp only serves POST /slots/:id?action=(save|restore) when it was
// started with --slot-save-path. Without it the request lands on a 501
// not_supported_error (b11609) or — on other OpenAI-compatible routers that
// only expose /v1 semantics — a 404 "model `None`/`X` does not exist".
// Auto-save used to fire blind POSTs at turn/end every time; now the plugin
// probes once per server (10-minute TTL) and goes dormant when unsupported.
// Manual save/load commands surface a precise reason instead of a raw 404.
const SLOT_SUPPORT_TTL_MS = 10 * 60 * 1000;
const slotSupportCache = new Map(); // key: baseURL -> {supported, at}

async function probeSlotSupport(server) {
	const key = server.baseURL;
	const cached = slotSupportCache.get(key);
	if (cached && (Date.now() - cached.at) < SLOT_SUPPORT_TTL_MS) return cached.supported;
	let supported = false;
	try {
		const response = await fetch(new URL("/slots/0?action=restore", server.baseURL).href, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ filename: "__dsh_probe__.bin" })
		});
		let text = "";
		try { text = await response.text(); } catch {}
		// 501 not_supported       -> llama.cpp without --slot-save-path
		// 404 mentioning the model -> router that does not know the path at all
		if (response.status === 501 || /not_supported/i.test(text)) supported = false;
		else if (response.status === 404 && /model|does not exist/i.test(text)) supported = false;
		else supported = true; // missing slot file etc. -> server knows the endpoint
	} catch {
		supported = false; // server unreachable -> nothing to save onto
	}
	slotSupportCache.set(key, { supported, at: Date.now() });
	return supported;
}

function probeNote(server) {
	return "KV cache slots not supported by " + server.providerId + " (" + server.baseURL +
		"): start llama-server with --slot-save-path (e.g. --slot-save-path $DSH/home/slots)";
}

// --- end capability probe -----------------------------------------------------

function getPiSettings(ctx) {
	const settings = ctx.get("settings");
	if (!settings || typeof settings.describe !== "function") return null;
	const entry = settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === "llm-pi-ai");
	const value = entry?.value;
	if (!value || !value.providers) return null;
	return value;
}

function getSession(invocation) {
	return invocation && invocation.agent && invocation.agent.session;
}

function selectionFromEvents(session) {
	if (!session || typeof session.snapshotEvents !== "function") return null;
	let events;
	try {
		events = session.snapshotEvents();
	} catch {
		return null;
	}
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i];
		if (event.type === "model/selection" && event.data?.provider && event.data?.model) {
			return { provider: event.data.provider, model: event.data.model };
		}
		if (event.type === "request/header" && event.data?.header?.config?.provider) {
			const config = event.data.header.config;
			return { provider: config.provider, model: config.model };
		}
	}
	return null;
}

function getSelection(invocation) {
	const session = getSession(invocation);
	let header;
	try {
		header = session && typeof session.requestHeader === "function" ? session.requestHeader() : null;
	} catch {
		header = null;
	}
	if (header?.config?.provider) {
		return { provider: header.config.provider, model: header.config.model };
	}
	const fromEvents = selectionFromEvents(session);
	if (fromEvents) return fromEvents;
	const options = invocation && invocation.agent && invocation.agent.options;
	if (options?.provider) {
		return { provider: options.provider, model: options.model };
	}
	return null;
}

function firstModel(provider) {
	if (provider?.models && provider.models.length > 0) return provider.models[0].id;
	return "";
}

function resolveServer(ctx, invocation) {
	const piSettings = getPiSettings(ctx);
	if (!piSettings?.providers) {
		return { error: "No llm-pi-ai provider settings found" };
	}
	const selection = getSelection(invocation);
	if (selection?.provider) {
		const provider = piSettings.providers[selection.provider];
		if (!provider?.baseURL) {
			return { error: "Active provider '" + selection.provider + "' has no baseURL configured" };
		}
		return {
			providerId: selection.provider,
			baseURL: provider.baseURL,
			model: selection.model || firstModel(provider)
		};
	}
	const entries = Object.entries(piSettings.providers);
	if (entries.length === 0) {
		return { error: "No LLM provider configured" };
	}
	const [providerId, provider] = entries[0];
	if (!provider?.baseURL) {
		return { error: "Provider '" + providerId + "' has no baseURL configured" };
	}
	return {
		providerId: providerId,
		baseURL: provider.baseURL,
		model: firstModel(provider),
		fallback: true
	};
}

function getSessionFilename(invocation) {
	const session = getSession(invocation);
	const id = session && session.id ? String(session.id) : "session";
	return id.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 64) + ".bin";
}

async function requestJson(url, body) {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	});
	const text = await response.text();
	let data = {};
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = { raw: text };
		}
	}
	if (!response.ok) {
		const detail = data?.error?.message || data?.error || data?.raw || response.statusText;
		throw new Error(String(detail) + " (HTTP " + response.status + ")");
	}
	return data;
}

function errorText(prefix, error) {
	return prefix + ": " + (error && error.message ? error.message : String(error));
}

function apply(ctx) {
	ctx.commands.register({
		definitionId: "@residenthiago/dsh-save-kv-cache",
		name: "save-kv-cache",
		description: "Save KV cache slot to disk on the active llama.cpp server",
		handler: async (invocation) => {
			const server = resolveServer(ctx, invocation);
			if (server.error) {
				return { kind: "error", text: server.error };
			}
			if (!(await probeSlotSupport(server))) {
				return { kind: "error", text: probeNote(server) };
			}
			const slotId = invocation.rawInput.trim() || "0";
			const filename = getSessionFilename(invocation);
			const saveUrl = new URL("/slots/" + slotId + "?action=save", server.baseURL).href;
			try {
				const data = await requestJson(saveUrl, { filename: filename });
				const bytes = data.n_written != null ? data.n_written + " bytes" : "saved";
				const tokens = data.n_saved != null ? data.n_saved + " tokens" : "";
				const ms = data.timings?.save_ms != null ? " in " + data.timings.save_ms + " ms" : "";
				return {
					kind: "success",
					text: "KV cache slot " + slotId + " saved on " + server.providerId + " (" + server.baseURL + ") as " + filename + ": " + bytes + (tokens ? ", " + tokens : "") + ms
				};
			} catch (error) {
				return { kind: "error", text: errorText("KV cache save failed on " + server.providerId, error) };
			}
		}
	});

	ctx.commands.register({
		definitionId: "@residenthiago/dsh-save-kv-cache/load",
		name: "load-kv-cache",
		description: "Restore a saved KV cache from disk on the active llama.cpp server",
		handler: async (invocation) => {
			const server = resolveServer(ctx, invocation);
			if (server.error) {
				return { kind: "error", text: server.error };
			}
			if (!(await probeSlotSupport(server))) {
				return { kind: "error", text: probeNote(server) };
			}
			const slotId = "0";
			const filename = invocation.rawInput.trim() || getSessionFilename(invocation);
			const loadUrl = new URL("/slots/" + slotId + "?action=restore", server.baseURL).href;
			try {
				const data = await requestJson(loadUrl, { filename: filename });
				const tokens = data.n_restored != null ? data.n_restored + " tokens" : "restored";
				const bytes = data.n_read != null ? data.n_read + " bytes" : "";
				const ms = data.timings?.restore_ms != null ? " in " + data.timings.restore_ms + " ms" : "";
				return {
					kind: "success",
					text: "KV cache restored on " + server.providerId + " (" + server.baseURL + ") from " + filename + ": " + tokens + (bytes ? ", " + bytes : "") + ms
				};
			} catch (error) {
				return { kind: "error", text: errorText("KV cache load failed on " + server.providerId, error) };
			}
		}
	});

	ctx.on("session/event", async function(subject, event) {
		if (event.type !== "turn/end") return;
		const server = resolveServer(ctx, { agent: { session: subject } });
		if (server.error || server.fallback) return;
		// Capability probe first: never POST slot saves at a server that does
		// not support them (auto-save stays silent on failure by design, so an
		// unsupported server previously produced invisible 404 traffic).
		if (!(await probeSlotSupport(server))) return;
		const filename = getSessionFilename({ agent: { session: subject } });
		const saveUrl = new URL("/slots/0?action=save", server.baseURL).href;
		fetch(saveUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ filename: filename })
		}).catch(function() {});
	});
}

export { apply, inject, name };
