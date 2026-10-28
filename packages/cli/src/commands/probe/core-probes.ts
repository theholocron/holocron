import type { PluginLoader, PluginProbes } from "../../plugin/index.js";
import { describeProviderError } from "../../ui/provider-error/index.js";

/** The group of probes that belong to the CLI itself, not to a provider. */
export const CORE_PROVIDER = "core";

/**
 * `core providers`: which capabilities loaded and which did not, and why (a provider that fails to load, for a missing
 * token or option such as an account id, is skipped quietly by every other command); then each provider and the probes it
 * offers.
 */
export function coreProbes(loader: PluginLoader, builtIn: ReadonlyMap<string, PluginProbes> = new Map()): PluginProbes {
	return {
		providers: {
			summary: "Show which configured providers loaded, and why any did not.",
			writes: false,
			async run(ctx) {
				ctx.say({ status: "heading", label: "Capabilities" });
				for (const key of loader.loadedKeys()) ctx.say({ status: "ok", label: key });
				for (const f of loader.loadFailures()) {
					ctx.say({
						status: "fail",
						label: `${f.key} (${f.provider})`,
						detail: describeProviderError(f.error),
					});
				}

				const offered = new Map<string, PluginProbes>(loader.probes());
				const names = new Set<string>();
				for (const key of loader.loadedKeys()) {
					const impl = loader.get(key) as { providerName?: string } | Array<{ providerName?: string }>;
					for (const one of Array.isArray(impl) ? impl : [impl]) {
						if (one.providerName) names.add(one.providerName);
					}
				}
				for (const name of offered.keys()) names.add(name);
				ctx.say({ status: "heading", label: "Providers" });
				for (const name of [...names].sort()) {
					const own = offered.get(name);
					ctx.say({
						status: "info",
						label: name,
						detail: own ? Object.keys(own).sort().join(", ") : "no probes yet",
					});
				}
				for (const [name, own] of [...builtIn].sort(([a], [b]) => a.localeCompare(b))) {
					ctx.say({
						status: "info",
						label: `${name} (built in)`,
						detail: Object.keys(own).sort().join(", "),
					});
				}
			},
		},
	};
}
