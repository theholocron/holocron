/**
 * `holocron auth export` — print the tokens a configured plugin takes as `NAME=value` lines, to move them into a
 * credentials environment (`op` cannot write to a 1Password Environment, so the last step is the app's import).
 *
 * The names come from the plugins' `tokens` (the list `doctor tokens` and `doctor credentials` use) and each value from
 * the OS keyring, or, with `--from-env`, from the environment first. Nothing but the lines ever carries a value: the
 * names, counts and what was not found go to stderr and the log gets counts only.
 *
 * Where the lines go: to stdout when it is a pipe; on a terminal to a private file (`.credentials`, mode 0600, which
 * git must ignore and which is never overwritten) that is shredded once the import is done, so tokens are never
 * printed to a screen or left in scrollback; to the clipboard when asked. A regular file as stdout (`> file`) is
 * refused, because it would leave plaintext tokens on disk without any of those protections.
 */

import { closeSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { errorMessage } from "@theholocron/misc-utils";

import {
	copyToClipboard,
	dotenvLine,
	type FileIdentity,
	getToken,
	isGitIgnored,
	isKeyringAvailable,
	shredFile,
	writeCredentialsFile,
} from "../../auth/index.js";
import { makeEnv } from "../../env/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { WorkspaceContextError } from "../../plugin/index.js";
import { style, waitForEnter } from "../../ui/index.js";
import { createDefaultImporter, type PluginToken } from "../auth/index.js";
import { configuredPackages } from "../doctor-tokens/index.js";
import type { AuthExportReport, RunAuthExportInput } from "./auth-export.type.js";

const COMMAND = "auth export";

/** Plain code-unit order: the same on every machine, whatever its locale. The names it sorts are all different. */
const compare = (a: string, b: string): number => (a < b ? -1 : 1);

/** Signals that end the wait for the import, with the exit status each is conventionally reported as. */
const INTERRUPTS = [
	["SIGINT", 130],
	["SIGTERM", 143],
	["SIGHUP", 129],
] as const;

/** The file the lines go to on a terminal when none is named. */
const DEFAULT_FILE = ".credentials";

export async function runAuthExport(input: RunAuthExportInput): Promise<AuthExportReport> {
	const print = input.print ?? ((line: string) => console.error(line));
	const logger = input.logger ?? getLogger();
	const refuse = (reason: string, ...message: string[]): AuthExportReport => {
		for (const line of message) print(line);
		logger.warn({ status: "fail", reason }, COMMAND);
		return { status: "fail", exported: [], missing: [], conflicts: [], unsupported: [], unavailable: [] };
	};

	// Once the lines are in the file, say what to do with it and, on a terminal, delete it when the import is done.
	// Returns whether the file is gone (or was left on purpose): `false` means plaintext tokens are still on disk.
	const finishFile = async (path: string, identity: FileIdentity): Promise<boolean> => {
		print(`wrote ${path} (readable only by you)`);
		print("import it in the 1Password app: Developer, View Environments, the Environment, Import .env file");
		if (input.keep || !input.interactive) {
			// The file stays, so the descriptor held for its cleanup is no longer needed.
			closeSync(identity.fd);
			print(`it holds your tokens in plain text: delete it when you are done: ${path}`);
			return true;
		}
		// Reports what happened to the file honestly: "deleted" only when it was, and what to do when it was not.
		const cleanup = (): boolean => {
			try {
				const outcome = (input.shred ?? shredFile)(path, identity);
				if (outcome === "deleted") print(`deleted ${path}`);
				else if (outcome === "missing") print(`${path} was already gone`);
				else print(`left ${path} alone: it is no longer the file this command wrote`);
				return true;
			} catch (err) {
				print(`could not delete ${path}: ${errorMessage(err)}`);
				print(`it holds your tokens in plain text: delete it yourself: ${path}`);
				return false;
			}
		};
		// Ctrl-C, a terminated process and a closed terminal must not leave the file behind.
		const handlers = INTERRUPTS.map(([signal, code]) => {
			const handler = () => {
				cleanup();
				process.exit(code);
			};
			process.once(signal, handler);
			return [signal, handler] as const;
		});
		let cleaned: boolean;
		try {
			await (input.waitForImport ?? waitForEnter)(
				"press Enter when the import is done and the file will be deleted: "
			);
		} finally {
			for (const [signal, handler] of handlers) process.off(signal, handler);
			// Also when the wait threw: the file must not outlive the command.
			cleaned = cleanup();
		}
		return cleaned;
	};

	if (!input.to && input.outKind === "other") {
		return refuse(
			"file",
			"refusing to write tokens to a redirected file: it would leave them on disk with no protection",
			"run it on a terminal to write the private, short-lived .credentials file, or pipe the output to a tool"
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
	const reasons = new Map<string, string>();
	const packages = configuredPackages(input);
	for (const pkg of packages) {
		let listed: PluginToken[] | undefined;
		try {
			listed = (await importer(pkg)).tokens;
		} catch (err) {
			unavailable.push(pkg);
			reasons.set(pkg, errorMessage(err).split("\n")[0] as string);
			continue;
		}
		for (const token of listed ?? []) {
			const first = tokens.get(token.envName);
			if (!first) tokens.set(token.envName, token);
			else if (first.keyringKey !== token.keyringKey) conflicts.add(token.envName);
			// The same token declared again: it is optional only if every plugin that declares it says so.
			else tokens.set(token.envName, { ...first, optional: first.optional === true && token.optional === true });
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
	for (const [name, token] of [...tokens].sort(([a], [b]) => compare(a, b))) {
		if (conflicts.has(name)) continue;
		const fromEnv = input.fromEnv
			? env.get(name) || (token.vendorEnvName ? env.get(token.vendorEnvName) : undefined)
			: undefined;
		// The same order the commands use: the entry stored for the org first, then the plain one.
		const value =
			fromEnv || (input.org ? keyring(`${token.keyringKey}.${input.org}`) : null) || keyring(token.keyringKey);
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

	const target = input.to ?? (input.outKind === "terminal" ? "file" : undefined);
	let destination: AuthExportReport["destination"];
	let file: string | undefined;
	let identity: FileIdentity | undefined;
	if (lines.length > 0) {
		const text = `${lines.join("\n")}\n`;
		if (target === "clipboard") {
			try {
				await (input.copy ?? copyToClipboard)(text);
			} catch (err) {
				return refuse(
					"clipboard",
					`could not copy to the clipboard: ${errorMessage(err)}`,
					"write the private file instead: `holocron auth export --file`"
				);
			}
			destination = "clipboard";
		} else if (target === "file") {
			if ((input.platform ?? process.platform) === "win32") {
				return refuse(
					"windows",
					"cannot make the file private on Windows: its mode bits are not enforced, so other users may read it",
					"use `holocron auth export --copy`, or pipe the output to a tool"
				);
			}
			file = resolve(dirname(input.loaded.filepath), input.file || DEFAULT_FILE);
			// Only a positive answer lets the file be written: if git cannot say, it might be committed.
			const git = (input.isIgnored ?? isGitIgnored)(file);
			if (git === "tracked" || git === "unknown") {
				return refuse(
					"not-ignored",
					git === "tracked"
						? `refusing to write tokens to ${file}: git does not ignore it, so it could be committed`
						: `refusing to write tokens to ${file}: git could not say whether it ignores it`,
					"add it to .gitignore, or choose a path outside the repository with --file"
				);
			}
			try {
				identity = (input.writeFile ?? writeCredentialsFile)(file, text, input.force === true);
			} catch (err) {
				return refuse(
					"write",
					`could not write ${file}: ${errorMessage(err)}`,
					"an existing file is never overwritten: delete it, or pass --force to replace it"
				);
			}
			destination = "file";
		} else {
			input.out(text);
			destination = "out";
		}
	}

	// One row per token: written (✓), not found (·), or left out for a reason the row gives (✗). Names only.
	print(`exported ${exported.length} of ${tokens.size}:`);
	for (const name of exported) print(`  ${style.success(name)}`);
	for (const name of missing) {
		print(`  ${style.dim("·")} ${name}${tokens.get(name)?.optional ? style.dim("  (optional)") : ""}`);
	}
	for (const name of [...conflicts].sort(compare)) {
		print(`  ${style.fail(`${name}  (listed by two plugins under different keyring entries, so not exported)`)}`);
	}
	for (const name of unsupported) {
		print(`  ${style.fail(`${name}  (a value dotenv cannot carry unchanged, so add it by hand)`)}`);
	}
	if (unavailable.length > 0) {
		print("");
		print("could not load, so the tokens they take are not listed:");
		for (const pkg of [...unavailable].sort(compare)) print(`  ${style.fail(`${pkg}  (${reasons.get(pkg)})`)}`);
	}
	// What happened to the lines they were written to, set apart from the list.
	if (destination === "clipboard" || destination === "file") print("");
	if (destination === "clipboard") print("copied to the clipboard: paste it, then clear the clipboard");
	// A file that could not be deleted is a failure even though the export worked: tokens are still on disk.
	const cleaned = destination === "file" && file && identity ? await finishFile(file, identity) : true;
	const status = !cleaned ? "fail" : exported.length > 0 ? "ok" : "skip";
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
		conflicts: [...conflicts].sort(compare),
		unsupported,
		unavailable: [...unavailable].sort(compare),
		...(destination ? { destination } : {}),
		...(file ? { file } : {}),
	};
}
