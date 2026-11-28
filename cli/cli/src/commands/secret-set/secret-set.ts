/**
 * `holocron new secret` — one-shot single-secret push.
 *
 * Complements `holocron sync secrets` (bulk vault → destinations) for
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

import { createEnvLookup } from "@theholocron/env-utils/lookup";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type SecretScope } from "../../plugin/index.js";
import { generateSecretValue } from "../generated-secrets/index.js";
import type { RunSecretSetInput, SecretSetReport } from "./secret-set.type.js";
import { runSecretToFile } from "./secret-to-file/index.js";

const env = createEnvLookup();

export async function runSecretSet(input: RunSecretSetInput): Promise<SecretSetReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);

	// A value is either made (a name in the generated table) or taken from the caller, never both.
	if (input.generate && (input.value || input.fromStdin || input.fromEnv)) {
		throw new Error("--generate makes the value: do not also pass a value, --from-stdin or --from-env");
	}
	if (input.target === "file") {
		const value = input.generate ? generateSecretValue(input.name, input.random) : await resolveValue(input);
		if (!value) throw new Error(noValueMessage(input.name));
		return runSecretToFile(input, value, print, loader, logger);
	}
	if (input.environment) throw new Error("--env belongs to --target file: a GitHub secret is named by --scope");

	await loader.load();
	assertPluginsResolvable(loader, "new secret");

	const dryRun = input.context.dryRun ?? false;
	const scope: SecretScope = input.scope ?? { kind: "repo" };

	if (!loader.has("secrets")) {
		throw new Error("`secrets` capability is not configured — add a `secrets` provider to holocron.config.json");
	}

	// Resolve the value to push, surfacing a clear error when none can be sourced.
	const value = input.generate ? generateSecretValue(input.name, input.random) : await resolveValue(input);
	if (!value) throw new Error(noValueMessage(input.name));
	if (input.generate) print("  the value is made now and not shown, so it cannot be copied anywhere else");

	print(`Holocron secret set — ${input.name} (${describeScope(scope)})${dryRun ? " (dry-run)" : ""}`);

	if (dryRun) {
		const message = `would: secrets.setSecret(${describeScope(scope)}, ${input.name}, <${value.length} chars>)`;
		print(`  … ${message}`);
		return { status: "dry-run", name: input.name, scope, message };
	}

	try {
		const secrets = loader.get("secrets");
		await secrets.setSecret(scope, input.name, value);
		print(`  ✓ set ${input.name} via ${secrets.providerName}`);
		// `name` is a secret NAME, never the value.
		logger.info(
			{ key: input.name, scope: describeScope(scope), provider: secrets.providerName, status: "ok" },
			`secret set: ${input.name}`
		);
		return { status: "ok", name: input.name, scope };
	} catch (err) {
		const message = errorMessage(err);
		print(`  ✗ ${message}`);
		logger.warn({ key: input.name, scope: describeScope(scope), reason: message }, `secret set: ${input.name}`);
		return { status: "fail", name: input.name, scope, message };
	}
}

// ── helpers ──────────────────────────────────────────────────────────

function noValueMessage(name: string): string {
	return `no value for secret \`${name}\` — pass it positionally, via --from-stdin, --from-env <NAME>, or set $${name} in the environment`;
}

async function resolveValue(input: RunSecretSetInput): Promise<string | undefined> {
	if (input.value) return input.value;
	if (input.fromStdin) {
		const reader = input.readStdin ?? defaultReadStdin;
		const text = await reader();
		return text.replace(/\r?\n$/, ""); // trim trailing newline
	}
	if (input.fromEnv) {
		return env.get(input.fromEnv);
	}
	// Implicit: env var with the same name as the secret.
	return env.get(input.name);
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
