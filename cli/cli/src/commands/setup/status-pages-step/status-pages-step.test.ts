import { describe, expect, it, vi } from "vitest";

import type { Dns, Monitoring, MonitoringStatusPageResult, PluginLoader } from "../../../plugin/index.js";
import { statusPagesStep } from "./status-pages-step.js";

const PAGE = { name: "The Holocron", slug: "theholocron", domain: "status.example.dev", components: [] };

const RESULT: MonitoringStatusPageResult = {
	id: "p1",
	created: true,
	components: { created: ["A"], updated: [] },
	rules: { created: ["A"], updated: [] },
	domain: {
		name: "status.example.dev",
		verified: false,
		record: { type: "CNAME", name: "status.example.dev", value: "target.example.net" },
		extraRecords: [{ type: "TXT", name: "_own.status.example.dev", value: "abc" }],
	},
};

function fakes(opts: { result?: MonitoringStatusPageResult; withDns?: boolean; page?: typeof PAGE } = {}) {
	const ensure = vi.fn(async () => opts.result ?? RESULT);
	const monitoring = {
		statusPages: [opts.page ?? PAGE],
		ensureStatusPage: ensure,
	} as unknown as Monitoring;
	const upsert = vi.fn(async (_domain: string, r: unknown) => r);
	const loader = {
		has: (key: string) => key === "dns" && opts.withDns !== false,
		get: () => ({ upsertRecord: upsert }) as unknown as Dns,
	} as unknown as PluginLoader;
	return { monitoring, loader, ensure, upsert };
}

describe("statusPagesStep", () => {
	it("ensures the page and makes the records the provider asks for, DNS-only, through the dns provider", async () => {
		const { monitoring, loader, upsert } = fakes();
		const steps = await statusPagesStep(monitoring, loader, false);
		expect(steps.map((s) => [s.step, s.status])).toEqual([
			["ensureStatusPage The Holocron", "ok"],
			["dns status.example.dev", "ok"],
			["dns _own.status.example.dev", "ok"],
		]);
		expect(upsert).toHaveBeenCalledWith("status.example.dev", {
			type: "CNAME",
			name: "status.example.dev",
			content: "target.example.net",
			proxied: false,
		});
		expect(upsert).toHaveBeenCalledWith(
			"_own.status.example.dev",
			expect.objectContaining({ type: "TXT", content: "abc", proxied: false })
		);
	});

	it("writes nothing on a dry run, not even DNS", async () => {
		const { monitoring, loader, ensure, upsert } = fakes();
		const steps = await statusPagesStep(monitoring, loader, true);
		expect(steps.map((s) => s.status)).toEqual(["dry-run", "dry-run"]);
		expect(ensure).not.toHaveBeenCalled();
		expect(upsert).not.toHaveBeenCalled();
	});

	it("fails with a todo that names the record when there is no dns provider", async () => {
		const { monitoring, loader } = fakes({ withDns: false });
		const steps = await statusPagesStep(monitoring, loader, false);
		const todos = steps.filter((s) => s.status === "fail");
		expect(todos).toHaveLength(2);
		expect(todos[0]?.message).toBe(
			"todo: no `dns` provider is configured; make CNAME status.example.dev -> target.example.net"
		);
	});

	it("reports a record that could not be made, and carries on", async () => {
		const { monitoring, loader, upsert } = fakes();
		upsert.mockRejectedValueOnce(new Error("zone not found"));
		const steps = await statusPagesStep(monitoring, loader, false);
		expect(steps[1]).toMatchObject({ status: "fail", message: "zone not found" });
		expect(steps[2]?.status).toBe("ok");
	});

	it("makes no record for a verified domain, and a todo when the provider names none", async () => {
		const verified = fakes({ result: { ...RESULT, domain: { name: "status.example.dev", verified: true } } });
		expect((await statusPagesStep(verified.monitoring, verified.loader, false))[1]).toMatchObject({
			status: "ok",
			message: "domain verified",
		});
		expect(verified.upsert).not.toHaveBeenCalled();

		const none = fakes({ result: { ...RESULT, domain: { name: "status.example.dev", verified: false } } });
		expect((await statusPagesStep(none.monitoring, none.loader, false))[1]?.status).toBe("fail");
	});

	it("does nothing for a page with no domain, and skips a provider without the method", async () => {
		const noDomain = fakes({ page: { ...PAGE, domain: undefined as unknown as string } });
		expect(await statusPagesStep(noDomain.monitoring, noDomain.loader, false)).toHaveLength(1);

		const bare = { statusPages: [PAGE] } as unknown as Monitoring;
		expect((await statusPagesStep(bare, noDomain.loader, false))[0]?.status).toBe("skip");
		expect(await statusPagesStep({} as Monitoring, noDomain.loader, false)).toEqual([]);
	});

	it("does not touch DNS when the page step failed", async () => {
		const { monitoring, loader, ensure, upsert } = fakes();
		ensure.mockRejectedValueOnce(new Error("401"));
		const steps = await statusPagesStep(monitoring, loader, false);
		expect(steps.map((s) => s.status)).toEqual(["fail"]);
		expect(upsert).not.toHaveBeenCalled();
	});

	it("says a page that was already there exists, and counts nothing made", async () => {
		const { monitoring, loader } = fakes({
			result: {
				id: "p1",
				created: false,
				components: { created: [], updated: [] },
				rules: { created: [], updated: [] },
				domain: { name: "status.example.dev", verified: true },
			},
		});
		const [step] = await statusPagesStep(monitoring, loader, false);
		expect(step).toMatchObject({ step: "ensureStatusPage The Holocron", status: "ok" });
		expect(step?.message).toBe("exists; 0 made, 0 brought in line");
	});
});
