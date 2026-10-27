import type { ProbeContext, ProbeRow } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import { type ChecklyClient, DISCORD_TEMPLATE } from "../rest.js";
import { CHECK_NAME } from "./deliver.js";
import { checklyProbes } from "./index.js";
import type { ChecklyProbeDeps } from "./probe-deps.type.js";

function ctxFor(dryRun = false) {
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const writes: string[] = [];
	const undo: Array<() => Promise<void>> = [];
	const ctx: ProbeContext = {
		dryRun,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async (label, fn) => {
			if (dryRun) {
				writes.push(`would ${label}`);
				return undefined;
			}
			writes.push(label);
			return fn();
		},
		cleanup: (_label, fn) => void undo.push(fn),
	};
	const runCleanups = async () => {
		for (const fn of undo.reverse()) await fn();
	};
	return { ctx, rows, secrets, writes, runCleanups };
}

const URL_SECRET = "https://discord.com/api/webhooks/1/very-secret-token";
const channel = (over: Record<string, unknown> = {}, config: Record<string, unknown> = {}) => ({
	id: 7,
	type: "WEBHOOK",
	config: {
		name: "Message to #uptime",
		url: URL_SECRET,
		webhookType: "WEBHOOK_DISCORD",
		template: DISCORD_TEMPLATE,
		...config,
	},
	sendFailure: true,
	sendRecovery: true,
	sendDegraded: true,
	subscriptions: [
		{ checkId: "a", activated: true },
		{ checkId: "b", activated: true },
	],
	...over,
});
const check = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `check ${id}`, tags: [], ...over });

type Status = { checkId: string; hasFailures: boolean; lastCheckRunId?: string | null };

function world(
	over: {
		channels?: unknown[];
		checks?: unknown[];
		statuses?: Array<Status | "404">;
	} = {}
) {
	const statuses = [...(over.statuses ?? [])];
	const client = {
		alertChannels: {
			list: vi.fn(async () => over.channels ?? [channel()]),
			subscribe: vi.fn(async (_id: number, s: unknown) => s),
		},
		checks: {
			list: vi.fn(async () => over.checks ?? [check("a"), check("b")]),
			create: vi.fn(async (_input: { request: { assertions?: Array<{ target?: string }> } }) => ({
				id: "new-1",
			})),
			update: vi.fn(
				async (_id: string, _input: { request: { assertions?: Array<{ target?: string }> } }) => ({})
			),
			delete: vi.fn(async (_id: string) => {}),
		},
		checkStatuses: {
			get: vi.fn(async (_id: string) => {
				const next = statuses.shift();
				if (next === "404" || next === undefined) throw Object.assign(new Error("Not Found"), { status: 404 });
				return next;
			}),
		},
	};
	const deps: ChecklyProbeDeps = {
		client: () => client as unknown as ChecklyClient,
		env: {},
		sleep: async () => {},
		pollMs: 15_000,
		timeoutMs: 45_000,
	};
	return { client, deps };
}

describe("probe checkly channel", () => {
	it("describes the channel without printing the webhook URL, and is ok when everything is as shipped", async () => {
		const { deps } = world();
		const { ctx, rows, secrets } = ctxFor();
		await checklyProbes(deps).channel!.run(ctx);
		expect(secrets).toEqual([URL_SECRET]);
		expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
		expect(rows[0]!.detail).toContain("posts to discord.com");
		expect(rows[0]!.detail).toContain("sends: failure, recovery, degraded");
		expect(JSON.stringify(rows)).not.toContain("very-secret-token");
		expect(rows[2]!.label).toBe("all 2 checks use it");
	});

	it("fails a template that differs and checks that are not subscribed, and says what to run", async () => {
		const { deps } = world({
			channels: [
				channel(
					{
						sendFailure: false,
						sendRecovery: false,
						sendDegraded: false,
						subscriptions: [
							{ checkId: "a", activated: true },
							{ checkId: "b", activated: false },
						],
					},
					{ template: "old" }
				),
			],
		});
		const { ctx, rows } = ctxFor();
		await checklyProbes(deps).channel!.run(ctx);
		expect(rows[0]!.detail).toContain("sends: nothing");
		expect(rows[1]).toMatchObject({ status: "fail", detail: expect.stringContaining("notifications setup") });
		expect(rows[2]).toMatchObject({ status: "fail", label: "1 of 2 checks use it" });
	});

	it("takes the channel name from the real environment when none is injected", async () => {
		vi.stubEnv("HOLOCRON_CHECKLY_PROBE_CHANNEL", "Other");
		try {
			const { deps } = world({ channels: [channel({}, { name: "Other" })] });
			const { env: _env, ...bare } = deps;
			const { ctx, rows } = ctxFor();
			await checklyProbes(bare).channel!.run(ctx);
			expect(rows[0]!.label).toContain("Other");
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("copes with a URL it cannot read and a format that is not set", async () => {
		const { deps } = world({ channels: [channel({}, { url: "not a url", webhookType: undefined })] });
		const { ctx, rows } = ctxFor();
		await checklyProbes(deps).channel!.run(ctx);
		expect(rows[0]!.detail).toContain("posts to an unreadable URL");
		expect(rows[0]!.detail).toContain("format: unset");
	});

	it("reads every page of checks", async () => {
		const page = Array.from({ length: 100 }, (_, i) => check(`c${i}`));
		const { deps, client } = world({ channels: [channel({ subscriptions: [] })] });
		client.checks.list.mockResolvedValueOnce(page as never).mockResolvedValueOnce([check("last")] as never);
		const { ctx, rows } = ctxFor();
		await checklyProbes(deps).channel!.run(ctx);
		expect(client.checks.list).toHaveBeenCalledTimes(2);
		expect(rows[2]!.label).toBe("0 of 101 checks use it");
	});

	it("says how to name a channel that is not there, and honours the env override", async () => {
		const { deps } = world({ channels: [channel({}, { name: "Other" })] });
		await expect(checklyProbes(deps).channel!.run(ctxFor().ctx)).rejects.toThrow(
			/no alert channel named "Message to #uptime"/
		);
		const { ctx, rows } = ctxFor();
		await checklyProbes({ ...deps, env: { HOLOCRON_CHECKLY_PROBE_CHANNEL: "Other" } }).channel!.run(ctx);
		expect(rows[0]!.label).toContain("Other");
	});
});

describe("probe checkly deliver", () => {
	const failing: Status = { checkId: "new-1", hasFailures: true, lastCheckRunId: "run-1" };
	const passing: Status = { checkId: "new-1", hasFailures: false, lastCheckRunId: "run-2" };

	it("creates a failing check, subscribes it, waits for the failure, flips it, waits for the recovery, and can be cleaned up", async () => {
		const { deps, client } = world({ statuses: ["404", failing, failing, passing] });
		const { ctx, rows, writes, runCleanups } = ctxFor();
		await checklyProbes(deps).deliver!.run(ctx);
		expect(client.checks.create.mock.calls[0]![0]).toMatchObject({
			name: CHECK_NAME,
			frequency: 5,
			tags: ["delivery-proof"],
		});
		expect(client.checks.create.mock.calls[0]![0].request.assertions![0]!.target).toBe("418");
		expect(client.alertChannels.subscribe).toHaveBeenCalledWith(7, { checkId: "new-1", activated: true });
		expect(client.checks.update.mock.calls[0]![1].request.assertions![0]!.target).toBe("200");
		expect(writes).toEqual(["create the throwaway check", 'subscribe it to "Message to #uptime"', "make it pass"]);
		expect(rows.map((r) => [r.status, r.label])).toEqual([
			["info", "created and subscribed"],
			["ok", "Checkly sees the check failing"],
			["ok", "Checkly sees the check passing"],
		]);
		expect(rows[1]!.detail).toContain("red");
		expect(rows[2]!.detail).toContain("green");
		expect(client.checks.delete).not.toHaveBeenCalled();
		await runCleanups();
		expect(client.checks.delete).toHaveBeenCalledWith("new-1");
	});

	it("waits for a new run before it believes the recovery, not the failing run", async () => {
		const { deps, client } = world({ statuses: [failing, { ...failing, hasFailures: false }, passing] });
		const { ctx, rows } = ctxFor();
		await checklyProbes(deps).deliver!.run(ctx);
		expect(rows.at(-1)!.label).toBe("Checkly sees the check passing");
		expect(client.checkStatuses.get).toHaveBeenCalledTimes(3);
	});

	it("fails, and flips nothing, when Checkly never reports the failure", async () => {
		const { deps, client } = world({ statuses: [] });
		const { ctx, rows } = ctxFor();
		await checklyProbes(deps).deliver!.run(ctx);
		expect(rows.at(-1)).toMatchObject({
			status: "fail",
			label: "Checkly did not report the check failing in time",
		});
		expect(client.checks.update).not.toHaveBeenCalled();
	});

	it("fails when the recovery never comes", async () => {
		const { deps } = world({ statuses: [failing] });
		const { ctx, rows } = ctxFor();
		await checklyProbes(deps).deliver!.run(ctx);
		expect(rows.at(-1)).toMatchObject({
			status: "fail",
			label: "Checkly did not report the check passing in time",
		});
	});

	it("passes an unexpected status error on rather than waiting it out", async () => {
		const { deps, client } = world();
		client.checkStatuses.get.mockRejectedValueOnce(Object.assign(new Error("denied"), { status: 403 }));
		await expect(checklyProbes(deps).deliver!.run(ctxFor().ctx)).rejects.toThrow("denied");
	});

	it("removes a check of its own that an earlier run left behind, but refuses one that is not", async () => {
		const mine = check("old-1", { name: CHECK_NAME, tags: ["delivery-proof"] });
		const { deps, client } = world({ checks: [mine, check("other")], statuses: [failing, passing] });
		const { ctx, writes } = ctxFor();
		await checklyProbes(deps).deliver!.run(ctx);
		expect(client.checks.delete).toHaveBeenCalledWith("old-1");
		expect(writes[0]).toBe("remove a check an earlier run left behind");
		const foreign = check("x", { name: CHECK_NAME, tags: [] });
		await expect(checklyProbes(world({ checks: [foreign] }).deps).deliver!.run(ctxFor().ctx)).rejects.toThrow(
			/not a probe's/
		);
	});

	it("announces every step on a dry run and changes nothing", async () => {
		const { deps, client } = world();
		const { ctx, writes } = ctxFor(true);
		await checklyProbes(deps).deliver!.run(ctx);
		expect(writes).toHaveLength(5);
		expect(writes[0]).toContain("would create the throwaway check");
		expect(client.checks.create).not.toHaveBeenCalled();
		expect(client.alertChannels.subscribe).not.toHaveBeenCalled();
	});

	it("needs the alert channel to exist before it makes anything", async () => {
		const { deps, client } = world({ channels: [] });
		await expect(checklyProbes(deps).deliver!.run(ctxFor().ctx)).rejects.toThrow(/no alert channel/);
		expect(client.checks.create).not.toHaveBeenCalled();
	});

	it("uses a real timer and sensible waits when none are given", async () => {
		vi.useFakeTimers();
		try {
			const { deps } = world({ statuses: ["404", failing, passing] });
			const { sleep: _s, pollMs: _p, timeoutMs: _t, ...bare } = deps;
			const { ctx, rows } = ctxFor();
			const done = checklyProbes(bare).deliver!.run(ctx);
			await vi.advanceTimersByTimeAsync(60_000);
			await done;
			expect(rows.at(-1)!.label).toBe("Checkly sees the check passing");
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("checklyProbes", () => {
	it("offers two probes, and only deliver writes", () => {
		const probes = checklyProbes(world().deps);
		expect(Object.keys(probes).sort()).toEqual(["channel", "deliver"]);
		expect(probes.channel!.writes).toBe(false);
		expect(probes.deliver!.writes).toBe(true);
	});
});
