const name = "save-kv-cache";
const inject = ["commands"];

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
		definitionId: "@deepseek-ai/dsh-save-kv-cache",
		name: "save-kv-cache",
		description: "Save KV cache slot to disk on the active llama.cpp server",
		handler: async (invocation) => {
			const server = resolveServer(ctx, invocation);
			if (server.error) {
				return { kind: "error", text: server.error };
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
		definitionId: "@deepseek-ai/dsh-save-kv-cache/load",
		name: "load-kv-cache",
		description: "Restore a saved KV cache from disk on the active llama.cpp server",
		handler: async (invocation) => {
			const server = resolveServer(ctx, invocation);
			if (server.error) {
				return { kind: "error", text: server.error };
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

	ctx.on("session/event", function(subject, event) {
		if (event.type !== "turn/end") return;
		const server = resolveServer(ctx, { agent: { session: subject } });
		if (server.error || server.fallback) return;
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
