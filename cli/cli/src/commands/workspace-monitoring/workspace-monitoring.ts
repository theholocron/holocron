import { PluginLoader, type RuntimeContext } from "../../plugin/index.js";
import { whyMissing } from "../notifications-channel-add/index.js";
import { readWorkspaceConfigs } from "../workspace-configs/index.js";
import type { WorkspaceMonitoring } from "./workspace-monitoring.type.js";

/**
 * The checks, dashboards and status pages the workspace packages' configs declare, read through the `monitoring`
 * capability of a loader built over each package's config (the same walk as `workspaceProviders()`), so the command
 * knows no vendor's option names. Only the declarations are read: the plugin is built, no credential provider is asked
 * for a value and nothing is requested from the provider. A package with no `monitoring` provider declares nothing; one
 * whose config cannot be loaded, or whose provider cannot be built, is named in `unreadable`, because "declared
 * nowhere" cannot be known without it.
 */
export async function readWorkspaceMonitoring(context: RuntimeContext): Promise<WorkspaceMonitoring> {
	const out: WorkspaceMonitoring = { checks: [], dashboards: [], statusPages: [], unreadable: [] };
	for (const pkg of await readWorkspaceConfigs(context.repoRoot)) {
		if ("error" in pkg) {
			out.unreadable.push(`${pkg.path}: ${pkg.error}`);
			continue;
		}
		if (!pkg.resolved.providers.monitoring) continue;
		const loader = new PluginLoader(pkg.resolved, context, undefined, { readCredentials: false });
		await loader.load();
		if (!loader.has("monitoring")) {
			out.unreadable.push(
				`${pkg.path}: ${whyMissing(loader, "monitoring", "its monitoring provider is not available")}`
			);
			continue;
		}
		const monitoring = loader.get("monitoring");
		out.checks.push(...monitoring.checks);
		out.dashboards.push(...(monitoring.dashboards ?? []));
		out.statusPages.push(...(monitoring.statusPages ?? []));
	}
	return out;
}
