import type { PluginProbes } from "../../../plugin/index.js";
import { checkDeps } from "./check-deps.js";
import { planDeps } from "./plan-deps.js";
import { reportDeps } from "./report-deps.js";

/** The group of probes that report who uses which dependency and enforce the catalog rule. */
export const DEPS_PROVIDER = "deps";

/**
 * `deps report` prints every dependency with its catalog, range and how widely it is used; `deps who <name>` lists the
 * packages using the dependencies whose name contains `<name>`, by group; `deps check` fails for each dependency that
 * breaks the catalog rule written at the top of `pnpm-workspace.yaml` (CI runs it). Everything is read live from the
 * workspace manifests and `pnpm-workspace.yaml` on each run; nothing is cached.
 */
export function depsProbes(
	repoRoot: string,
	print: (text: string) => void = (text) => console.log(text)
): PluginProbes {
	return {
		report: {
			summary: "Print every dependency with its catalog, range and who uses it (markdown).",
			writes: false,
			async run(ctx) {
				print(reportDeps(planDeps(repoRoot)));
				ctx.say({ status: "ok", label: "report", detail: "printed above" });
			},
		},
		who: {
			summary: "List the packages that use a dependency, by group: `probe deps who <name>`.",
			writes: false,
			async run(ctx) {
				const name = ctx.args?.[0];
				if (!name) {
					ctx.say({ status: "fail", label: "who", detail: "name a dependency: probe deps who <name>" });
					return;
				}
				print(reportDeps(planDeps(repoRoot), name));
				ctx.say({ status: "ok", label: "who", detail: `printed above for "${name}"` });
			},
		},
		check: {
			summary: "Fail for each dependency that breaks the catalog rule (CI runs this).",
			writes: false,
			async run(ctx) {
				const p = planDeps(repoRoot);
				const problems = checkDeps(p);
				for (const line of problems) ctx.say({ status: "fail", label: line });
				if (problems.length === 0) {
					ctx.say({
						status: "ok",
						label: `${p.rows.filter((r) => r.catalog).length} dependencies`,
						detail: "all in the right catalog",
					});
				}
			},
		},
	};
}
