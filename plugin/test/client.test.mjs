import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The client half is a plain script in the window.__ModuleLoader__ format, so
// it can be exercised without a DOM: run it in a VM with a fake window and
// materialize the factory with a fake require.
const CLIENT_SOURCE = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

const ICONS = {
	IconDownloadOutlineRegular: function DownloadIcon() {},
	IconDataOutlineRegular: function DataIcon() {}
};

function materialize() {
	const registrations = [];
	const sandbox = {
		window: {
			__ModuleLoader__: {
				load: (registration) => {
					registrations.push(registration);
				}
			}
		}
	};
	vm.createContext(sandbox);
	vm.runInContext(CLIENT_SOURCE, sandbox, { filename: 'client.js' });
	assert.equal(registrations.length, 1, 'the bundle must register exactly one module');
	const registration = registrations[0];
	const exported = registration.factory((specifier) => {
		assert.equal(specifier, '@deepseek-ai/dsh-client-ui-primitives');
		return ICONS;
	});
	return { registration, exported };
}

function fakeService(rows, calls) {
	return {
		async candidates(session, req) {
			calls.push({ session, req });
			return rows.map((row) => ({ ...row }));
		}
	};
}

function fakeCtx(service, locale) {
	return {
		get(name) {
			if (name === 'commandUi') return service;
			if (name === 'locale') return locale;
			return undefined;
		}
	};
}

test('client bundle registers one module under the package id', () => {
	const { registration, exported } = materialize();
	assert.equal(registration.id, '@residenthiago/dsh-save-kv-cache');
	assert.equal(typeof exported.apply, 'function');
	// The array is created inside the VM context, so deepStrictEqual against a
	// host-realm array fails on prototype identity; copy it into this realm.
	assert.deepEqual([...exported.inject], ['commandUi', 'locale']);
});

test('apply injects label/description/icon for the two host commands only', async () => {
	const calls = [];
	const service = fakeService([
		{ name: 'save-kv-cache', description: 'catalog copy' },
		{ name: 'load-kv-cache', description: 'catalog copy' },
		{ name: 'compact', description: 'first-party row' }
	], calls);
	materialize().exported.apply(fakeCtx(service));

	const rows = await service.candidates({ sessionId: 's' }, { query: '' });
	assert.equal(calls.length, 1, 'the wrapped candidates must still call the original');

	assert.equal(rows[0].label, 'Save Session');
	assert.equal(rows[0].description, 'Save KV cache slot to disk on llama.cpp server');
	assert.equal(rows[0].icon, ICONS.IconDownloadOutlineRegular);

	assert.equal(rows[1].label, 'Load Session');
	assert.equal(rows[1].description, 'Load a saved KV cache from file into the current session');
	assert.equal(rows[1].icon, ICONS.IconDataOutlineRegular);

	assert.equal(rows[2].label, undefined, 'unrelated rows keep their own face');
	assert.equal(rows[2].icon, undefined);
});

test('apply is idempotent and degrades gracefully without commandUi', () => {
	const calls = [];
	const service = fakeService([{ name: 'save-kv-cache' }], calls);
	const { exported } = materialize();
	const ctx = fakeCtx(service);

	exported.apply(ctx);
	const first = service.candidates;
	exported.apply(ctx);
	assert.equal(service.candidates, first, 'a second apply must not wrap the wrapper');

	assert.doesNotThrow(() => exported.apply(fakeCtx(undefined)));
});

test('a missing icon seed degrades to labels instead of failing the client half', async () => {
	const registrations = [];
	const sandbox = {
		window: {
			__ModuleLoader__: {
				load: (registration) => {
					registrations.push(registration);
				}
			}
		}
	};
	vm.createContext(sandbox);
	vm.runInContext(CLIENT_SOURCE, sandbox, { filename: 'client.js' });
	const exported = registrations[0].factory(() => {
		throw new Error('module table miss');
	});

	const service = fakeService([{ name: 'save-kv-cache' }], []);
	exported.apply(fakeCtx(service));
	const rows = await service.candidates({}, {});
	assert.equal(rows[0].label, 'Save Session');
	assert.equal(rows[0].icon, undefined);
});

test('locale dictionaries localize the injected copy', async () => {
	const locale = {
		dicts: null,
		register(_ns, dicts) {
			this.dicts = dicts;
		},
		bind(_ns) {
			return (key) => this.dicts.zh[key] ?? this.dicts.en[key];
		}
	};
	const service = fakeService([{ name: 'save-kv-cache' }], []);
	materialize().exported.apply(fakeCtx(service, locale));

	const rows = await service.candidates({}, {});
	assert.equal(rows[0].label, '保存会话');
	assert.equal(rows[0].description, '保存 KV 缓存到 llama.cpp 服务器');
});
