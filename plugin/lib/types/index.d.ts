/**
 * Host half of @residenthiago/dsh-save-kv-cache.
 *
 * Registers the `/save-kv-cache` and `/load-kv-cache` host commands plus the
 * `turn/end` auto-save hook. Types are structural and dependency-free so the
 * package ships no type-only peer requirement.
 */

/** Minimal shape of the Cordis context this plugin consumes. */
export interface SaveKvCacheContext {
	commands: {
		register(definition: {
			definitionId: string;
			name: string;
			description: string;
			handler: (invocation: any) => Promise<{ kind: "success" | "error"; text: string }>;
		}): () => void;
	};
	on(event: string, handler: (subject: any, event: any) => unknown): void;
	get(name: string): unknown;
}

export declare const name = "save-kv-cache";
export declare const inject: string[];
export declare function apply(ctx: SaveKvCacheContext): void;
