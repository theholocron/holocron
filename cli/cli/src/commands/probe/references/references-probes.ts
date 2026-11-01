import type { PluginProbes, ProbeContext } from "../../../plugin/index.js";
import { cloneOrg } from "./clone-org.js";
import { findReferences, HOST_REPO } from "./find-references.js";
import type { Reference, ScannedRepo } from "./references.type.js";

/** The group of probes that look at the CI files the org shares. */
export const CI_PROVIDER = "ci";

function scan(repos: ScannedRepo[], needle: string): { repos: ScannedRepo[]; found: Reference[] } {
	return { repos, found: repos.flatMap((repo) => findReferences(repo, needle)) };
}

function summarise(ctx: ProbeContext, repos: ScannedRepo[], found: Reference[], needle: string, max?: number): void {
	ctx.say({ status: "heading", label: `References to ${needle}` });
	for (const repo of repos) {
		const own = found.filter((ref) => ref.repo === repo.name);
		const files = new Set(own.map((ref) => ref.file)).size;
		const count = (kind: Reference["kind"]) => own.filter((ref) => ref.kind === kind).length;
		ctx.say({
			status: "info",
			label: repo.name === HOST_REPO ? `${repo.name} (host)` : repo.name,
			detail: `${files} files: ${count("workflow")} workflow, ${count("action")} action, ${count("other")} other`,
		});
	}
	const outside = found.filter((ref) => ref.repo !== HOST_REPO).length;
	const detail = `${found.length - outside} more inside ${HOST_REPO}`;
	if (max !== undefined && outside > max) {
		ctx.say({
			status: "fail",
			label: `${outside} outside ${HOST_REPO}`,
			detail: `more than the ${max} allowed; ${detail}`,
		});
	} else {
		ctx.say({ status: "ok", label: `${outside} outside ${HOST_REPO}`, detail });
	}
}

/**
 * `ci refs` counts the references to the reusable workflows and composite actions hosted in `<org>/.github` across
 * every active repository of the org. It is the exit test for removing the forwarding shims there: they can go when
 * the count outside `.github` is zero. `ci refs <max>` fails above `<max>`. `ci ref-list` prints each reference with
 * its file and line.
 */
export function ciProbes(org: string | undefined, clone: (org: string) => ScannedRepo[] = cloneOrg): PluginProbes {
	const needle = (name: string) => `${name}/.github/.github/`;
	const read = (ctx: ProbeContext) => {
		if (!org) {
			ctx.say({ status: "fail", label: "no org", detail: "the config has no org to scan" });
			return null;
		}
		return { org, ...scan(clone(org), needle(org)) };
	};
	return {
		refs: {
			summary:
				"Count references to the reusable workflows and actions hosted in the org's .github repo (arg: max).",
			writes: false,
			async run(ctx) {
				const result = read(ctx);
				if (!result) return;
				const max = ctx.args?.[0] === undefined ? undefined : Number(ctx.args[0]);
				if (max !== undefined && !Number.isInteger(max)) {
					ctx.say({
						status: "fail",
						label: `\`${ctx.args![0]}\` is not a number`,
						detail: "usage: ci refs [max]",
					});
					return;
				}
				summarise(ctx, result.repos, result.found, needle(result.org), max);
			},
		},
		"ref-list": {
			summary: "List every reference to the org's .github workflows and actions, with file and line.",
			writes: false,
			async run(ctx) {
				const result = read(ctx);
				if (!result) return;
				for (const ref of result.found) {
					ctx.say({
						status: "info",
						label: `${ref.repo}:${ref.file}:${ref.line}`,
						detail: `${ref.kind}: ${ref.text}`,
					});
				}
				ctx.say({ status: "ok", label: `${result.found.length} references` });
			},
		},
	};
}
