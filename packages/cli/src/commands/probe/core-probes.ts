import type { PluginLoader, PluginProbes } from "../../plugin/index.js";
import { describeProviderError } from "../../ui/provider-error/index.js";

/** The group of probes that belong to the CLI itself, not to a provider. */
export const CORE_PROVIDER = "core";

/**
 * `core providers`: which providers the config names loaded and which did not, and why. A provider that fails to load
 * (a missing token, a missing option such as an account id) is skipped quietly by every other command.
 */
export function coreProbes(loader: PluginLoader): PluginProbes {
	return {
		providers: {
			summary: "Show which configured providers loaded, and why any did not.",
			writes: false,
			async run(ctx) {
				const failed = loader.loadFailures();
				for (const key of loader.loadedKeys()) ctx.say({ status: "ok", label: key });
				for (const f of failed) {
					ctx.say({
						status: "fail",
						label: `${f.key} (${f.provider})`,
						detail: describeProviderError(f.error),
					});
				}
				const withProbes = [...loader.probes().keys()];
				ctx.say({
					status: "info",
					label: "probes offered by",
					detail: withProbes.length > 0 ? withProbes.join(", ") : "no configured provider",
				});
			},
		},
	};
}
