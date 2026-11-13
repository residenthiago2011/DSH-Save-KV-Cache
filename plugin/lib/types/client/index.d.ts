/**
 * Client half of @residenthiago/dsh-save-kv-cache.
 *
 * Shipped as a pre-built `window.__ModuleLoader__` bundle (see lib/client.js).
 * It extends `ctx.commandUi.candidates` so the two host commands this plugin
 * registers carry a menu label, description, and glyph — the face DSH
 * 0.2.2-rc.1 only grants to first-party commands. Dispatch is untouched.
 */

/** Minimal shape of the client Cordis context this plugin consumes. */
export interface SaveKvCacheClientContext {
	get(name: string): any;
}

export declare const inject: string[];
export declare function apply(ctx: SaveKvCacheClientContext): void;
