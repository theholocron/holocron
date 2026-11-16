import { existsSync } from "node:fs";
import { join } from "node:path";

import { readWorkspacePackages } from "@theholocron/astromech";

import { loadConfig, type ResolvedHolocronConfig, type ResolvedTuple } from "../../config/index.js";
import { providerTuples } from "../provider-tuples/index.js";

/** The extensions a `holocron.config` can have. */
const CONFIG_EXTENSIONS = ["ts", "js", "mjs", "cjs", "json"];

/**
 * The providers the configs of the workspace's packages name (`apps/sentinel` names `vercel` for its `deployment`) that
 * `config` does not: what `doctor tokens` and `probe` load by name next to the repo's own, so the token a package's
 * provider needs is checked from the root. Nothing is written and the root config needs no key for it. The first
 * package to name a provider supplies its options (its `teamId`, from the shared `org` area). A package whose config
 * cannot be read is left out: its own commands report it.
 */
export async function workspaceProviders(repoRoot: string, config: ResolvedHolocronConfig): Promise<ResolvedTuple[]> {
	const known = new Set(providerTuples(config.providers).map((t) => t.provider));
	const found: ResolvedTuple[] = [];
	let packages: ReturnType<typeof readWorkspacePackages>;
	try {
		packages = readWorkspacePackages(repoRoot);
	} catch {
		return found;
	}
	for (const pkg of packages) {
		const dir = join(repoRoot, pkg.path ?? `${pkg.dir}/${pkg.slug}`);
		if (!CONFIG_EXTENSIONS.some((ext) => existsSync(join(dir, `holocron.config.${ext}`)))) continue;
		try {
			for (const tuple of providerTuples((await loadConfig(dir)).resolved.providers)) {
				if (known.has(tuple.provider)) continue;
				known.add(tuple.provider);
				found.push(tuple);
			}
		} catch {
			continue;
		}
	}
	return found;
}
