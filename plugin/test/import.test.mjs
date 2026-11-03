import assert from 'node:assert/strict';
import test from 'node:test';

import { apply, inject, name } from '../lib/index.js';

test('module shape: apply/inject/name exports', () => {
	assert.equal(typeof apply, 'function');
	assert.equal(typeof name, 'string');
	assert.ok(Array.isArray(inject), 'inject must be an array');
});

test('apply registers both commands and the session/event auto-save hook', () => {
	const commands = [];
	const hooks = [];
	const ctx = {
		commands: {
			register: (definition) => {
				commands.push(definition);
			}
		},
		on: (event, handler) => {
			hooks.push({ event, handler });
		},
		provide: () => {}
	};
	apply(ctx);

	const names = commands.map((command) => command.name).sort();
	assert.deepEqual(names, ['load-kv-cache', 'save-kv-cache']);
	for (const command of commands) {
		assert.equal(typeof command.definitionId, 'string');
		assert.equal(typeof command.handler, 'function');
	}
	const eventHook = hooks.find((hook) => hook.event === 'session/event');
	assert.ok(
		eventHook,
		'the auto-save hook must subscribe to session/event and react to turn/end inside'
	);
});

test('command handlers are async functions', () => {
	const commands = [];
	const ctx = {
		commands: {
			register: (definition) => {
				commands.push(definition);
			}
		},
		on: () => {},
		provide: () => {}
	};
	apply(ctx);
	for (const command of commands) {
		assert.equal(command.handler.constructor.name, 'AsyncFunction');
	}
});
