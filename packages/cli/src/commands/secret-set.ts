/**
 * `holocron secret set` — one-shot single-secret push.
 *
 * Complements `holocron secrets sync` (bulk vault → destinations) for
 * ad-hoc scenarios:
 *   - Bootstrap secrets (e.g., NPM_TOKEN on theholocron/holocron itself
 *     before the rest of the setup exists)
 *   - One-off rotations that don't warrant a vault sync
 *   - Setting secrets the vault doesn't track
 *
 * Value source resolution (in priority order):
 *   1. Positional `value` argument
 *   2. `--from-stdin` reads from stdin
 *   3. `--from-env <NAME>` reads from the named env var
 *   4. Implicit: env var matching the secret name (e.g., `NPM_TOKEN`)
 *
 * Errors clearly when no value can be sourced.
 */

import type { Secrets, SecretScope } from "../plugin/capabilities.js";
import type { LoadedConfig } from "../config/load-config.js";
import { PluginLoader, type RuntimeContext } from "../plugin/loader.js";

export type SecretSetPrint = (line: string) => void;

export interface RunSecretSetInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Secret name (e.g., `NPM_TOKEN`). */
	name: string;
	/** Secret value. If absent, resolves via stdin / env. */
	value?: string;
	/** Read from stdin instead of positional or env var. */
	fromStdin?: boolean;
	/** Read from a specific env var rather than implicit-by-name. */
	fromEnv?: string;
	/** Defaults to `{ kind: 'repo' }`. */
	scope?: SecretScope;
	loader?: PluginLoader;
	print?: SecretSetPrint;
	/** Lets tests inject a stdin reader. Defaults to reading process.stdin. */
	readStdin?: () => Promise<string>;
}

export interface SecretSetReport {
	status: "ok" | "fail" | "dry-run";
	name: string;
	scope: SecretScope;
	message?: string;
}

export async function runSecretSet(input: RunSecretSetInput): Promise<SecretSetReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();

	const dryRun = input.context.dryRun ?? false;
	const scope: SecretScope = input.scope ?? { kind: "repo" };

	if (!loader.has("secrets")) {
		throw new Error("`secrets` capability is not configured — add a `secrets` provider to holocron.config.json");
	}

	// Resolve the value to push, surfacing a clear error when none can be sourced.
	const value = await resolveValue(input);
	if (!value) {
		throw new Error(
			`no value for secret \`${input.name}\` — pass it positionally, via --from-stdin, --from-env <NAME>, or set $${input.name} in the environment`
		);
	}

	print(`Holocron secret set — ${input.name} (${describeScope(scope)})${dryRun ? " (dry-run)" : ""}`);

	if (dryRun) {
		const message = `would: secrets.setSecret(${describeScope(scope)}, ${input.name}, <${value.length} chars>)`;
		print(`  … ${message}`);
		return { status: "dry-run", name: input.name, scope, message };
	}

	try {
		const secrets = loader.get("secrets") as Secrets;
		await secrets.setSecret(scope, input.name, value);
		print(`  ✓ set ${input.name} via ${secrets.providerName}`);
		return { status: "ok", name: input.name, scope };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		print(`  ✗ ${message}`);
		return { status: "fail", name: input.name, scope, message };
	}
}

// ── helpers ──────────────────────────────────────────────────────────

async function resolveValue(input: RunSecretSetInput): Promise<string | undefined> {
	if (input.value) return input.value;
	if (input.fromStdin) {
		const reader = input.readStdin ?? defaultReadStdin;
		const text = await reader();
		return text.replace(/\r?\n$/, ""); // trim trailing newline
	}
	const env = process.env;
	if (input.fromEnv) {
		return env[input.fromEnv];
	}
	// Implicit: env var with the same name as the secret.
	return env[input.name];
}

async function defaultReadStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	return new Promise<string>((resolve, reject) => {
		process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
		process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		process.stdin.on("error", reject);
	});
}

function describeScope(scope: SecretScope): string {
	if (scope.kind === "repo") return "scope=repo";
	if (scope.kind === "environment") return `scope=environment:${scope.name}`;
	return `scope=organization:${scope.name}`;
}
