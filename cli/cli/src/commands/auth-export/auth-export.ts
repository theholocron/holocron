/**
 * `holocron auth export` — print the tokens a configured plugin takes as `NAME=value` lines, to move them into a
 * credentials environment (`op` cannot write to a 1Password Environment, so the last step is the app's import or a paste).
 *
 * The names come from the plugins' `tokens` (the list `doctor tokens` and `doctor credentials` use) and each value from
 * the OS keyring, or, with `--from-env`, from the environment first. Nothing but the lines ever carries a value: the
 * names, counts and what was not found go to stderr and the log gets counts only. The lines go to the clipboard when
 * stdout is a terminal (`clipboardy`, cross-platform), so they never land on a screen or in scrollback, to stdout when
 * it is a pipe, and nowhere when it is anything else (a regular file would leave plaintext tokens on disk).
 */

import { dirname } from "node:path";

import { errorMessage } from "@theholocron/misc-utils";

import { copyToClipboard, dotenvLine, getToken, isKeyringAvailable } from "../../auth/index.js";
import { makeEnv } from "../../env/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { WorkspaceContextError } from "../../plugin/index.js";
import { createDefaultImporter, type PluginToken } from "../auth/index.js";
import { configuredPackages } from "../doctor-tokens/index.js";
import type { AuthExportReport, RunAuthExportInput } from "./auth-export.type.js";

const COMMAND = "auth export";

export async function runAuthExport(input: RunAuthExportInput): Promise<AuthExportReport> {
	const print = input.print ?? ((line: string) => console.error(line));
	const logger = input.logger ?? getLogger();
	const refuse = (reason: string, ...message: string[]): AuthExportReport => {
		for (const line of message) print(line);
		logger.warn({ status: "fail", reason }, COMMAND);
		return { status: "fail", exported: [], missing: [], conflicts: [], unsupported: [], unavailable: [] };
	};

	if (input.outKind === "other") {
		return refuse(
			"file",
			"refusing to write tokens to a file: it would leave them on disk in plain text",
			"run it on a terminal to copy them, or pipe the output to a tool"
		);
	}
	if (!(input.keyringAvailable ?? isKeyringAvailable)()) {
		return refuse("keyring", "the OS keyring cannot be reached, so no stored token can be read");
	}

	const importer = input.importer ?? createDefaultImporter(dirname(input.loaded.filepath));
	const env = makeEnv(input.env);
	const keyring = input.keyring ?? getToken;

	// Every token the plugins list, by variable name. A name listed twice under the same keyring entry is one token;
	// under different entries it is a conflict, since one variable cannot hold both.
	const tokens = new Map<string, PluginToken>();
	const conflicts = new Set<string>();
	const unavailable: string[] = [];
	const packages = configuredPackages(input);
	for (const pkg of packages) {
		let listed: PluginToken[] | undefined;
		try {
			listed = (await importer(pkg)).tokens;
		} catch {
			unavailable.push(pkg);
			continue;
		}
		for (const token of listed ?? []) {
			const first = tokens.get(token.envName);
			if (!first) tokens.set(token.envName, token);
			else if (first.keyringKey !== token.keyringKey) conflicts.add(token.envName);
		}
	}
	// With every plugin unresolvable the list is empty for a reason the user can fix, not because there is nothing to do.
	if (packages.length > 0 && unavailable.length === packages.length) {
		throw new WorkspaceContextError(COMMAND, unavailable);
	}

	const lines: string[] = [];
	const exported: string[] = [];
	const missing: string[] = [];
	const unsupported: string[] = [];
	for (const [name, token] of tokens) {
		if (conflicts.has(name)) continue;
		const fromEnv = input.fromEnv
			? env.get(name) || (token.vendorEnvName ? env.get(token.vendorEnvName) : undefined)
			: undefined;
		const value = fromEnv || keyring(token.keyringKey);
		if (!value) {
			missing.push(name);
			continue;
		}
		const line = dotenvLine(name, value);
		if (line === null) {
			unsupported.push(name);
			continue;
		}
		lines.push(line);
		exported.push(name);
	}

	let destination: AuthExportReport["destination"];
	if (lines.length > 0) {
		const text = `${lines.join("\n")}\n`;
		if (input.outKind === "terminal") {
			try {
				await (input.copy ?? copyToClipboard)(text);
			} catch (err) {
				return refuse(
					"clipboard",
					`could not copy to the clipboard: ${errorMessage(err)}`,
					"pipe the output to a tool instead, for example `holocron auth export | some-tool`"
				);
			}
			destination = "clipboard";
		} else {
			input.out(text);
			destination = "out";
		}
	}

	print(`exported ${exported.length} of ${tokens.size}: ${exported.join(", ") || "none"}`);
	if (missing.length > 0) print(`not found: ${missing.join(", ")}`);
	if (conflicts.size > 0) {
		print(`not exported, listed by two plugins under different keyring entries: ${[...conflicts].join(", ")}`);
	}
	if (unsupported.length > 0) {
		print(`not exported, a value dotenv cannot carry unchanged (add it by hand): ${unsupported.join(", ")}`);
	}
	if (unavailable.length > 0) {
		print(`could not load, so the tokens they take are not listed: ${unavailable.join(", ")}`);
	}
	if (destination === "clipboard") print("copied to the clipboard: paste it, then clear the clipboard");
	const status = exported.length > 0 ? "ok" : "skip";
	logger.info(
		{
			exported: exported.length,
			missing: missing.length,
			conflicts: conflicts.size,
			unsupported: unsupported.length,
			unavailable: unavailable.length,
			status,
			destination,
		},
		COMMAND
	);
	return {
		status,
		exported,
		missing,
		conflicts: [...conflicts],
		unsupported,
		unavailable,
		...(destination ? { destination } : {}),
	};
}
