/**
 * `new secret --target file`: hand a value to the private import file for a vault, check the import took, and name what
 * comes next (spec `tech-rotate-generated-secrets`). The value is never printed, logged or returned. The CLI cannot write
 * to a 1Password Environment, so the vault side is a person's import; with an Environment named the command reads it before
 * and after and says whether the value changed.
 */
import { NonInteractiveError } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import { getLogger } from "../../../observability/logger/index.js";
import type { PluginLoader } from "../../../plugin/index.js";
import { handOffSecret } from "../../secret-handoff/index.js";
import { judgeImport, newSalt, readEnvironmentSecret } from "../../secret-import-check/index.js";
import { resolveEnvironmentId } from "../../secrets-sync/resolve-environment-id/index.js";
import type { RunSecretSetInput, SecretSetReport } from "../secret-set.type.js";

export async function runSecretToFile(
	input: RunSecretSetInput,
	value: string,
	print: (line: string) => void,
	loader: PluginLoader,
	logger: Logger = getLogger()
): Promise<SecretSetReport> {
	const { name } = input;
	const dryRun = input.context.dryRun ?? false;
	const repoRoot = input.context.repoRoot ?? process.cwd();
	const interactive = input.interactive ?? process.stdin.isTTY === true;
	const environment = input.environment
		? await (input.resolveEnvironment ?? ((id, root) => resolveEnvironmentId(id, { repoRoot: root })))(
				input.environment,
				repoRoot
			)
		: undefined;
	const into = environment ? ` for the \`${environment}\` Environment` : "";

	print(`Holocron secret set — ${name} to the private import file${into}${dryRun ? " (dry-run)" : ""}`);
	if (dryRun) {
		const message = `would write ${name} (<${value.length} chars>) to the private import file and wait for the import`;
		print(`  … ${message}`);
		return { status: "dry-run", name, message };
	}

	if (!input.yes) {
		if (!input.confirm) throw new NonInteractiveError("pass --yes to write the secret without a terminal");
		if (!(await input.confirm(`Write a new ${name} to the private import file${into}?`))) {
			print("  cancelled; nothing written");
			return { status: "cancelled", name };
		}
	}

	let vault;
	if (environment) {
		await loader.load();
		vault = loader.has("vault") ? loader.get("vault") : undefined;
	}
	const salt = newSalt();
	const before = environment ? await readEnvironmentSecret(vault, environment, name, salt) : undefined;

	const handed = await (input.handOff ?? handOffSecret)({
		name,
		value,
		base: repoRoot,
		print,
		interactive,
		...(environment ? { environment } : {}),
	});
	if (handed.status === "fail") {
		const message = `${name} was not handed over (${handed.reason ?? "failed"})`;
		print(`  ✗ ${message}`);
		logger.warn({ key: name, reason: handed.reason, status: "fail" }, `secret set: ${name}`);
		return { status: "fail", name, message };
	}

	if (environment && before) {
		const verdict = judgeImport(
			name,
			environment,
			before,
			await readEnvironmentSecret(vault, environment, name, salt)
		);
		print(`  ${verdict.status === "ok" ? "✓" : verdict.status === "fail" ? "✗" : "·"} ${verdict.message}`);
		logger.info({ key: name, status: verdict.status }, `secret import check: ${name}`);
		if (verdict.status === "fail") return { status: "fail", name, message: verdict.message };
	}

	const via = input.environment ? ` --env ${input.environment}` : " --env <environment>";
	print(
		`  next: holocron sync secrets${via} (with the same --cwd), then redeploy: a deployment only gets variables when it is deployed`
	);
	logger.info({ key: name, status: "ok" }, `secret set: ${name}`);
	return { status: "ok", name };
}
