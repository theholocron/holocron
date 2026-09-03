import { createEnvParser, type EnvLoader } from "@theholocron/env-utils";

export interface CliEnv {
	get(key: string): string | undefined;
}

function createCliEnv(loader: EnvLoader): CliEnv {
	const parser = createEnvParser({ appName: "holocron", loader, parseValues: false });
	return {
		get(key: string): string | undefined {
			const val = parser.get(key);
			return typeof val === "string" && val ? val : undefined;
		},
	};
}

/** Singleton env for simple global lookups throughout the CLI. */
export const env = createCliEnv({ load: () => process.env });

/**
 * Create an injectable env for commands that accept a fake env in tests.
 * Pass `input.env` when available, falls back to `process.env`.
 */
export function makeEnv(source: Record<string, string | undefined> = process.env): CliEnv {
	return createCliEnv({ load: () => source });
}
