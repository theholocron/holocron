import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ToolingOpenInput, ToolingOpenPlan, ToolingOpenWant } from "@theholocron/cli";
import { parseEnvironment } from "@usebruno/filestore";

import { readBaseline } from "./baseline.js";
import { referencedName } from "./secret-references.js";

/** The folder at the repo root that holds the workspace Bruno opens. */
const WORKSPACE = ".bruno";

/** Where the desktop app's program is on macOS; the only platform with a default (others set `app`). */
export const MACOS_APP = "/Applications/Bruno.app/Contents/MacOS/Bruno";

/** What {@link openPlan} needs beyond its input. */
export interface OpenPlanOptions {
	/** The program that starts Bruno; the default is the macOS app's. */
	app?: string | undefined;
	/** The platform, `process.platform` unless a test says otherwise. */
	platform?: NodeJS.Platform | undefined;
}

/** The `.yml` files of a folder, sorted; none when the folder is not there. */
async function environmentFiles(dir: string): Promise<string[]> {
	try {
		return (await readdir(dir)).filter((name) => name.endsWith(".yml")).sort();
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw err;
	}
}

/**
 * What it takes to open the committed `.bruno/` workspace with its secrets filled in: for each collection the baseline
 * lists, the secret variables its environments hold. A variable that is a reference to an entry (`{{process.env.NAME}}`,
 * written by `sync requests` for each name in the `secretRefs` option) is a value to fill; a secret variable with no
 * reference is reported as unfilled. Reads files only and returns names and paths, never a value.
 *
 * @throws {Error} When there is no workspace to open, or the platform has no known program for Bruno and `app` is not set.
 */
export async function openPlan(input: ToolingOpenInput, options: OpenPlanOptions = {}): Promise<ToolingOpenPlan> {
	const { repoRoot, collectionFiles } = input;
	const known = await readBaseline(repoRoot);
	const folders = (known?.baseline.pairs ?? [])
		.filter((pair) => pair.kind === "collection" && collectionFiles.includes(pair.source))
		.map((pair) => pair.workspace);
	if (folders.length === 0) {
		throw new Error(
			`no ${WORKSPACE}/ workspace to open for these collections; run \`holocron sync requests\` first`
		);
	}
	const command = options.app ?? ((options.platform ?? process.platform) === "darwin" ? MACOS_APP : undefined);
	if (command === undefined) {
		throw new Error(
			"this platform has no known program for Bruno; set the `app` option to the path of its executable"
		);
	}

	const wants: ToolingOpenWant[] = [];
	const unfilled = new Set<string>();
	for (const folder of folders) {
		const dir = join(repoRoot, WORKSPACE, folder, "environments");
		for (const file of await environmentFiles(dir)) {
			const environment = parseEnvironment(await readFile(join(dir, file), "utf8"), { format: "yml" });
			for (const variable of environment.variables ?? []) {
				const entry = referencedName(variable.value);
				if (entry !== undefined) {
					const seen = wants.some((w) => w.collection === folder && w.variable === variable.name);
					if (!seen) wants.push({ collection: folder, variable: variable.name, entry });
				} else if (variable.secret) {
					unfilled.add(`${folder}: ${variable.name}`);
				}
			}
		}
	}
	// A variable that is a reference in one environment and a blank secret in another is still filled where it refers.
	const stillUnfilled = [...unfilled].filter(
		(label) => !wants.some((w) => `${w.collection}: ${w.variable}` === label)
	);
	return {
		app: "Bruno",
		wants,
		unfilled: stillUnfilled,
		targets: folders.map((folder) => join(repoRoot, WORKSPACE, folder, ".env")),
		launch: { command, args: [join(repoRoot, WORKSPACE)] },
		running: command,
	};
}
