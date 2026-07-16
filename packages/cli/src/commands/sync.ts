import type { Source } from "../capabilities/index.js";
import type { LoadedConfig } from "../load-config.js";
import { PluginLoader, type RuntimeContext } from "../loader.js";
import { CANONICAL_LABELS, STALE_LABELS } from "./setup.js";
import type { SetupPrintLine, SetupReport, SetupStepResult } from "./setup.js";

export const SYNC_STEPS = ["labels", "properties", "topics"] as const;
export type SyncStep = (typeof SYNC_STEPS)[number];

export interface RunSyncInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	steps?: string[];
	loader?: PluginLoader;
	print?: SetupPrintLine;
}

export async function runSync(input: RunSyncInput): Promise<SetupReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();

	const config = input.loaded.resolved;
	const dryRun = input.context.dryRun ?? false;
	const requestedSteps = input.steps;
	const steps: SetupStepResult[] = [];

	print(`Holocron sync — ${config.project.name}${dryRun ? " (dry-run)" : ""}`);
	print(`  config: ${input.loaded.filepath}`);
	print("");

	if (loader.has("source")) {
		const source = loader.get("source") as Source;
		print("  → source");

		for (const stepName of SYNC_STEPS) {
			if (requestedSteps !== undefined && !requestedSteps.includes(stepName)) {
				continue;
			}

			if (stepName === "labels") {
				if (source.syncLabels) {
					steps.push(
						await runSyncStep("source", "sync labels", dryRun, () =>
							source.syncLabels!(CANONICAL_LABELS, STALE_LABELS)
						)
					);
					print(formatSyncStep(steps[steps.length - 1]!));
				} else {
					steps.push({
						capability: "source",
						step: "sync labels",
						status: "skip",
						message: "provider does not implement syncLabels",
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				}
			}

			if (stepName === "properties") {
				if (source.syncProperties) {
					const repo = config.project.repo;
					const properties: Record<string, string> = {};
					const manual = repo?.properties ?? {};
					if (manual.lifecycle) properties["lifecycle"] = manual.lifecycle;
					if (manual.open_source !== undefined) properties["open_source"] = String(manual.open_source);
					if (manual.runtime_environment) properties["runtime_environment"] = manual.runtime_environment;
					if (manual.uses_external_packages !== undefined)
						properties["uses_external_packages"] = String(manual.uses_external_packages);

					steps.push(
						await runSyncStep("source", "sync properties", dryRun, () => source.syncProperties!(properties))
					);
					print(formatSyncStep(steps[steps.length - 1]!));
				} else {
					steps.push({
						capability: "source",
						step: "sync properties",
						status: "skip",
						message: "provider does not implement syncProperties",
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				}
			}

			if (stepName === "topics") {
				const topics = config.project.repo?.topics ?? [];
				if (topics.length === 0) {
					steps.push({
						capability: "source",
						step: "sync topics",
						status: "skip",
						message: "no topics configured",
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				} else if (source.syncTopics) {
					steps.push(await runSyncStep("source", "sync topics", dryRun, () => source.syncTopics!(topics)));
					print(formatSyncStep(steps[steps.length - 1]!));
				} else {
					steps.push({
						capability: "source",
						step: "sync topics",
						status: "skip",
						message: "provider does not implement syncTopics",
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				}
			}
		}

		// Report unknown step names
		if (requestedSteps) {
			for (const name of requestedSteps) {
				if (!(SYNC_STEPS as ReadonlyArray<string>).includes(name)) {
					steps.push({
						capability: "source",
						step: `sync ${name}`,
						status: "skip",
						message: `unknown step "${name}"`,
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				}
			}
		}
	}

	const summary = steps.reduce(
		(acc, s) => {
			if (s.status === "ok") acc.ok += 1;
			else if (s.status === "fail") acc.fail += 1;
			else if (s.status === "skip") acc.skip += 1;
			else if (s.status === "dry-run") acc.dryRun += 1;
			return acc;
		},
		{ ok: 0, fail: 0, skip: 0, dryRun: 0 }
	);

	print("");
	print(
		`  ${summary.ok} ok, ${summary.fail} fail, ${summary.skip} skipped${
			dryRun ? `, ${summary.dryRun} would-do` : ""
		}`
	);

	return { steps, summary };
}

async function runSyncStep(
	capability: string,
	step: string,
	dryRun: boolean,
	body: () => Promise<string | void>
): Promise<SetupStepResult> {
	if (dryRun) {
		return { capability, step, status: "dry-run" };
	}
	try {
		const note = await body();
		const result: SetupStepResult = { capability, step, status: "ok" };
		if (typeof note === "string") result.message = note;
		return result;
	} catch (err) {
		return {
			capability,
			step,
			status: "fail",
			message: err instanceof Error ? err.message : String(err),
		};
	}
}

function formatSyncStep(step: SetupStepResult): string {
	const icon = step.status === "ok" ? "✓" : step.status === "fail" ? "✗" : step.status === "dry-run" ? "…" : "·";
	const detail = step.message ? `  (${step.message})` : "";
	return `    ${icon} ${step.step}${detail}`;
}
