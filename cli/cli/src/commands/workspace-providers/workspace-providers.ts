import { type ResolvedHolocronConfig, type ResolvedTuple } from "../../config/index.js";
import { providerTuples } from "../provider-tuples/index.js";
import { readWorkspaceConfigs } from "../workspace-configs/index.js";

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
	for (const pkg of await readWorkspaceConfigs(repoRoot)) {
		if ("error" in pkg) continue;
		for (const tuple of providerTuples(pkg.resolved.providers)) {
			if (known.has(tuple.provider)) continue;
			known.add(tuple.provider);
			found.push(tuple);
		}
	}
	return found;
}
