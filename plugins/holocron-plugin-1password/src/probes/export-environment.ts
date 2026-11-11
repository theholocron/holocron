import { ignoreAdvice, type Probe, type ProbeContext, resolveCredentialsFile } from "@theholocron/cli";
import { dotenvLine, type FileIdentity, finishCredentialsFile } from "@theholocron/kyber/secrets";

import type { ExportEnvironmentDeps } from "./export-environment.type.js";
import { parseExportArgs } from "./parse-export-args.js";

/** The name of the file the lines go to (in `.holocron/.private/`), for the messages. */
const FILE_NAME = ".credentials";

/** Plain code-unit order: the same on every machine, whatever its locale. The names it sorts are all different. */
const compare = (a: string, b: string): number => (a < b ? -1 : 1);

type Destination = "file" | "stdout" | "clipboard";

/** Where the lines may go. Throws (with no value in the message) when nowhere is safe. */
function chooseDestination(deps: ExportEnvironmentDeps, copy: boolean): Destination {
	if (copy) return "clipboard";
	const kind = deps.outKind();
	if (kind === "pipe") return "stdout";
	if (kind === "other") {
		throw new Error(
			"refusing to write secrets to a redirected file: it would leave them on disk with no protection. " +
				"Run it on a terminal for the private, short-lived .credentials file, or pipe the output to a tool, or use --copy"
		);
	}
	if (deps.platform === "win32") {
		throw new Error(
			"cannot make the file private on Windows: its mode bits are not enforced, so other users may read it. " +
				"Use --copy, or pipe the output to a tool"
		);
	}
	if (!deps.interactive) {
		throw new Error(
			"the .credentials file is deleted once you confirm the import, which needs a terminal to ask on. " +
				"Pipe the output to a tool, or use --copy"
		);
	}
	return "file";
}

/** Writes the lines to the private file, waits for the import and deletes it. Registers the deletion for a failure or Ctrl-C. */
async function writeToFile(probe: ProbeContext, deps: ExportEnvironmentDeps, text: string): Promise<void> {
	// `.holocron/.private/.credentials`; its directory is made first so git can be asked about the file.
	const { path } = resolveCredentialsFile(deps.repoRoot, undefined, deps.makeDir);
	// Only a positive answer lets the file be written: if git cannot say, it might be committed.
	const git = deps.isIgnored(path);
	if (git === "tracked" || git === "unknown") {
		const why =
			git === "tracked"
				? "git does not ignore it, so it could be committed"
				: "git could not say whether it ignores it";
		throw new Error(`refusing to write secrets to ${path}: ${why}; ${ignoreAdvice(true, "")}`);
	}
	let identity: FileIdentity;
	try {
		identity = deps.writeFile(path, text, false);
	} catch (err) {
		const reason = err instanceof Error ? err.message : "unknown error";
		throw new Error(`could not write ${path}: ${reason}. An existing file is never overwritten: delete it first`, {
			cause: err,
		});
	}
	// Registered at once, so the file is removed even if the steps after it fail or are interrupted.
	probe.cleanup(`the ${FILE_NAME} file`, async () => {
		deps.shred(path, identity);
	});
	const gone = await finishCredentialsFile({
		path,
		identity,
		print: (line) => probe.say({ status: "info", label: line }),
		holds: "the Environment's secrets",
		importHint:
			"import it in the 1Password app: Developer, View Environments, the target Environment, Import .env file",
		interactive: deps.interactive,
		shred: deps.shred,
		waitForImport: deps.waitForImport,
	});
	if (!gone)
		probe.say({ status: "fail", label: `${path} is still on disk and holds secrets in plain text: delete it` });
}

/**
 * The `export-environment` probe: reads one 1Password Environment in memory and writes its variables as `NAME=value`
 * to a private `.credentials` file (deleted once the import into another Environment is done), a pipe or the clipboard.
 * Names and counts are all it ever reports; a value is only ever in the text handed to the destination.
 */
export function exportEnvironmentProbe(deps: ExportEnvironmentDeps): Probe {
	return {
		summary:
			"Read one 1Password Environment in memory and write its variables as NAME=value to a private .credentials file (deleted after the import), a pipe or the clipboard.",
		writes: true,
		reportsTo: "stderr",
		async run(probe) {
			const args = parseExportArgs(probe.args ?? []);
			const destination = chooseDestination(deps, args.copy);

			const environment = await deps.resolveId(args.environment, deps.repoRoot);
			const all = await deps.read(environment);
			const present = Object.keys(all);
			const unknown = args.only.filter((name) => !present.includes(name));
			if (unknown.length > 0) {
				throw new Error(`${environment} has no variable named ${unknown.join(", ")}`);
			}
			const names = (args.only.length > 0 ? [...new Set(args.only)] : present).sort(compare);
			if (names.length === 0) {
				probe.say({
					status: "info",
					label: environment,
					detail: "has no variables, so there is nothing to export",
				});
				return;
			}

			const lines: string[] = [];
			const exported: string[] = [];
			for (const name of names) {
				const value = all[name]!;
				probe.secret(value);
				const line = dotenvLine(name, value);
				if (line === null) {
					probe.say({
						status: "fail",
						label: name,
						detail: "a value dotenv cannot carry unchanged, so add it by hand",
					});
					continue;
				}
				lines.push(line);
				exported.push(name);
			}
			if (lines.length === 0) return;
			const text = `${lines.join("\n")}\n`;

			probe.say({ status: "heading", label: `${environment}: ${exported.length} of ${names.length} variables` });
			for (const name of exported) probe.say({ status: "info", label: name });

			const label = `write ${exported.length} variables to ${destination === "file" ? FILE_NAME : destination}`;
			await probe.write(label, async () => {
				if (destination === "clipboard") {
					await deps.copy(text);
					probe.say({ status: "ok", label: "copied to the clipboard: paste it, then clear the clipboard" });
				} else if (destination === "stdout") {
					deps.out(text);
					probe.say({ status: "ok", label: "wrote the variables to stdout" });
				} else {
					await writeToFile(probe, deps, text);
				}
			});
		},
	};
}
