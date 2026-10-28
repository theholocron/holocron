import type { Probe } from "@theholocron/cli";
import type { SentryWorkflowInput } from "@theholocron/sentry-client";

import { toInput } from "../capabilities/relay.js";
import { requireOrg, type SentryProbeDeps } from "./probe-deps.type.js";

const FROM = 5;
const TO = 10;

/** The detector the throwaway rule hangs on: the issue stream of `HOLOCRON_SENTRY_PROBE_PROJECT`, else of any project. */
async function detectorFor(deps: SentryProbeDeps, org: string): Promise<string> {
	const client = deps.client();
	const slug = (deps.env ?? process.env)["HOLOCRON_SENTRY_PROBE_PROJECT"];
	const [detectors, projects] = await Promise.all([
		client.workflows.detectors(org),
		slug ? client.projects.list(org) : Promise.resolve([]),
	]);
	const streams = detectors.filter((d) => d.type === "issue_stream");
	if (slug) {
		const project = projects.find((p) => p.slug === slug);
		if (!project) throw new Error(`Sentry project \`${slug}\` was not found in ${org}`);
		const own = streams.find((d) => d.projectId === project.id);
		if (!own) throw new Error(`Sentry project \`${slug}\` has no issue stream detector`);
		return own.id;
	}
	const any = streams[0];
	if (!any) throw new Error("no project has an issue stream detector to attach a throwaway rule to");
	return any.id;
}

export function ruleUpdateProbe(deps: SentryProbeDeps): Probe {
	return {
		summary:
			"Make a disabled throwaway alert rule, change it the way the relay's adopt path does, read it back, delete it.",
		writes: true,
		async run(probe) {
			const org = requireOrg(deps);
			const client = deps.client();
			const detectorId = await detectorFor(deps, org);
			const body: SentryWorkflowInput = {
				name: `Holocron probe: throwaway rule (${new Date().toISOString()})`,
				// Off, and with nothing to send, so it can never notify anyone while it exists.
				enabled: false,
				environment: null,
				config: { frequency: FROM },
				detectorIds: [detectorId],
				triggers: {
					logicType: "any-short",
					conditions: [{ type: "new_high_priority_issue", comparison: true, conditionResult: true }],
				},
				actionFilters: [{ logicType: "all", conditions: [], actions: [] }],
			};

			const created = await probe.write("create a disabled throwaway alert rule", async () => {
				const wf = await client.workflows.create(org, body);
				// Registered at once, so it is removed even if the steps after it fail or are interrupted.
				probe.cleanup(`the throwaway rule ${wf.id}`, () => client.workflows.delete(org, wf.id));
				return wf;
			});
			if (!created) {
				probe.say({
					status: "info",
					label: `would then change its frequency ${FROM} to ${TO} with PUT, read it back, and delete it`,
				});
				return;
			}
			probe.say({ status: "ok", label: "created", detail: `rule ${created.id}, disabled` });

			const next = toInput(created);
			next.config = { ...created.config, frequency: TO };
			await client.workflows.update(org, created.id, next);
			probe.say({ status: "ok", label: "PUT accepted" });

			const read = await client.workflows.get(org, created.id);
			const kept = !read.enabled && read.detectorIds.includes(detectorId);
			probe.say(
				read.config.frequency === TO && kept
					? {
							status: "ok",
							label: "read back",
							detail: `frequency ${read.config.frequency}, still disabled and attached`,
						}
					: {
							status: "fail",
							label: "read back differs",
							detail: `frequency ${read.config.frequency} (sent ${TO}), enabled ${read.enabled}, detectors ${read.detectorIds.join(",")}`,
						}
			);
		},
	};
}
