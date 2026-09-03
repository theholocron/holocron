export interface CliEnv {
	get(key: string): string | undefined;
}

/**
 * Singleton env for simple global lookups throughout the CLI.
 * Reads from process.env on every call — tests can mutate process.env freely.
 */
export const env: CliEnv = {
	get(key: string): string | undefined {
		const val = process.env[key];
		return typeof val === "string" && val ? val : undefined;
	},
};

/**
 * Create an injectable env for commands that accept a fake env in tests.
 * Pass `input.env` when available, falls back to `process.env`.
 */
export function makeEnv(source: Record<string, string | undefined> = process.env): CliEnv {
	return {
		get(key: string): string | undefined {
			const val = source[key];
			return typeof val === "string" && val ? val : undefined;
		},
	};
}
