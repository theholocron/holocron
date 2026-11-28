import type { Probe, ProbeContext } from "@theholocron/cli";

import type { ApiCheckInput, ChecklyClient } from "../rest.js";
import { findChannel } from "./find-channel.js";
import { channelName, type ChecklyProbeDeps } from "./probe-deps.type.js";

export const CHECK_NAME = "holocron-delivery-proof (delete me)";
const TAG = "delivery-proof";

/** An API check on a URL that always answers 200: asserting 418 makes it fail, asserting 200 makes it pass. */
const checkInput = (status: 200 | 418): ApiCheckInput => ({
	name: CHECK_NAME,
	frequency: 5,
	locations: ["us-east-1"],
	activated: true,
	tags: [TAG],
	request: {
		url: "https://example.com",
		method: "GET",
		assertions: [{ source: "STATUS_CODE", comparison: "EQUALS", target: String(status) }],
	},
});

const isNotFound = (err: unknown): boolean => (err as { status?: number })?.status === 404;

async function statusOf(client: ChecklyClient, id: string) {
	try {
		return await client.checkStatuses.get(id);
	} catch (err) {
		if (isNotFound(err)) return undefined;
		throw err;
	}
}

/** Reads the check's status until `done` accepts it, or the time is up. */
async function waitFor(
	deps: ChecklyProbeDeps,
	client: ChecklyClient,
	id: string,
	done: (s: NonNullable<Awaited<ReturnType<typeof statusOf>>>) => boolean
) {
	const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const pollMs = deps.pollMs ?? 15_000;
	const timeoutMs = deps.timeoutMs ?? 12 * 60_000;
	for (let waited = 0; waited <= timeoutMs; waited += pollMs) {
		const status = await statusOf(client, id);
		if (status && done(status)) return status;
		await sleep(pollMs);
	}
	return undefined;
}

/** Take away a check of this probe's own that an earlier run left behind (it carries the probe's tag). */
async function removeLeftover(client: ChecklyClient, probe: ProbeContext): Promise<void> {
	const left = (await client.checks.list({ search: CHECK_NAME })).filter((c) => c.name === CHECK_NAME);
	for (const check of left) {
		if (!check.tags.includes(TAG)) {
			throw new Error(
				`a check named "${CHECK_NAME}" exists but is not a probe's (no \`${TAG}\` tag); rename or delete it`
			);
		}
		await probe.write("remove a check an earlier run left behind", () => client.checks.delete(check.id));
	}
}

export function deliverProbe(deps: ChecklyProbeDeps): Probe {
	return {
		summary:
			"Make a check that must fail, then pass, and follow both alerts to Discord (about 10 to 20 minutes). The check is always removed.",
		writes: true,
		async run(probe) {
			const client = deps.client();
			const channel = await findChannel(client, deps);

			if (probe.dryRun) {
				for (const step of [
					`create the throwaway check "${CHECK_NAME}" (asserting 418, every 5 minutes)`,
					`subscribe it to "${channelName(deps)}"`,
					"wait for Checkly to see it fail",
					"make it assert 200 and wait for Checkly to see it pass",
					"delete the check",
				]) {
					await probe.write(step, async () => {});
				}
				return;
			}

			await removeLeftover(client, probe);
			// A dry run returned above, so `write` has run and answered.
			const check = (await probe.write("create the throwaway check", () =>
				client.checks.create(checkInput(418))
			))!;
			probe.cleanup("the throwaway check", () => client.checks.delete(check.id));
			await probe.write(`subscribe it to "${channel.config.name}"`, () =>
				client.alertChannels.subscribe(channel.id, { checkId: check.id, activated: true })
			);
			probe.say({ status: "info", label: "created and subscribed", detail: "Checkly runs it every 5 minutes" });

			const failing = await waitFor(deps, client, check.id, (s) => Boolean(s.lastCheckRunId) && s.hasFailures);
			if (!failing) {
				probe.say({ status: "fail", label: "Checkly did not report the check failing in time" });
				return;
			}
			probe.say({
				status: "ok",
				label: "Checkly sees the check failing",
				detail: `look in #uptime for a red "${CHECK_NAME} has failed" with Status code 200`,
			});

			await probe.write("make it pass", () => client.checks.update(check.id, checkInput(200)));
			const passing = await waitFor(
				deps,
				client,
				check.id,
				(s) => Boolean(s.lastCheckRunId) && s.lastCheckRunId !== failing.lastCheckRunId && !s.hasFailures
			);
			if (!passing) {
				probe.say({ status: "fail", label: "Checkly did not report the check passing in time" });
				return;
			}
			probe.say({
				status: "ok",
				label: "Checkly sees the check passing",
				detail: `look in #uptime for a green "${CHECK_NAME} has recovered"`,
			});
		},
	};
}
