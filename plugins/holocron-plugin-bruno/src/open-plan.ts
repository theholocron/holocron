import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ToolingOpenInput, ToolingOpenPlan, ToolingOpenWant } from "@theholocron/cli";
import { parseEnvironment } from "@usebruno/filestore";

import { readBaseline } from "./baseline.js";
import { layeredName, referencedName, type SecretWiring } from "./secret-references.js";

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
	/** Which secret variables are filled from outside and which layer each Bruno environment is. */
	wiring?: SecretWiring | undefined;
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
 * written by `sync requests` from the `secretRefs` and `environmentLayers` options, as that layer's copy of the entry) is a value
 * to fill, for its layer; a secret variable with no
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
			// Bruno's reader always gives a list, empty for a file with none.
			const layer = options.wiring?.layers[environment.name];
			for (const variable of environment.variables as NonNullable<typeof environment.variables>) {
				const name = referencedName(variable.value);
				const entry = options.wiring?.refs[variable.name];
				if (name === undefined) {
					if (variable.secret) unfilled.add(`${folder} (${environment.name}): ${variable.name}`);
				} else if (layer !== undefined && entry !== undefined && name === layeredName(layer, entry)) {
					const seen = wants.some(
						(w) => w.collection === folder && w.variable === variable.name && w.layer === layer
					);
					if (!seen) wants.push({ collection: folder, variable: variable.name, layer, entry, name });
				} else {
					// A reference the config does not account for would never be filled: say so rather than skip it.
					unfilled.add(
						`${folder} (${environment.name}): ${variable.name} refers to ${name}, which no secretRefs and environmentLayers give`
					);
				}
			}
		}
	}
	return {
		app: "Bruno",
		wants,
		unfilled: [...unfilled],
		targets: folders.map((folder) => join(repoRoot, WORKSPACE, folder, ".env")),
		launch: { command, args: [join(repoRoot, WORKSPACE)] },
		running: command,
	};
}
