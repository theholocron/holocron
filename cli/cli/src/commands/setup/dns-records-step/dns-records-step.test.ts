import { describe, expect, it, vi } from "vitest";

import type { Dns, PluginLoader } from "../../../plugin/index.js";
import { dnsRecordsStep } from "./dns-records-step.js";

const LIST = JSON.stringify([
	{ type: "CNAME", name: "status.example.dev", value: "target.example.net", note: "Checkly dashboard" },
	{ type: "TXT", name: "_v.example.dev", value: "proof", proxied: true },
]);
const io = (text: string | null) => ({ read: async () => text, write: async () => undefined });

function fakes(opts: { withDns?: boolean; upsert?: (d: string, r: unknown) => Promise<unknown> } = {}) {
	const upsert = vi.fn(opts.upsert ?? (async (_d: string, r: unknown) => r));
	const loader = {
		has: (key: string) => key === "dns" && opts.withDns !== false,
		get: () => ({ upsertRecord: upsert }) as unknown as Dns,
	} as unknown as PluginLoader;
	return { loader, upsert };
}

describe("dnsRecordsStep", () => {
	it("makes each listed record through the dns provider, DNS only unless the entry is proxied", async () => {
		const { loader, upsert } = fakes();
		const steps = await dnsRecordsStep(loader, "/r", false, io(LIST));
		expect(steps.map((s) => [s.step, s.status, s.message])).toEqual([
			["dns CNAME status.example.dev", "ok", "made (DNS only): Checkly dashboard"],
			["dns TXT _v.example.dev", "ok", "made"],
		]);
		expect(upsert).toHaveBeenCalledWith("status.example.dev", {
			type: "CNAME",
			name: "status.example.dev",
			content: "target.example.net",
			proxied: false,
		});
		expect(upsert).toHaveBeenCalledWith("_v.example.dev", expect.objectContaining({ proxied: true }));
	});

	it("has no steps when there is no list", async () => {
		const { loader } = fakes();
		expect(await dnsRecordsStep(loader, "/r", false, io(null))).toEqual([]);
	});

	it("writes nothing on a dry run", async () => {
		const { loader, upsert } = fakes();
		const steps = await dnsRecordsStep(loader, "/r", true, io(LIST));
		expect(steps.map((s) => s.status)).toEqual(["dry-run", "dry-run"]);
		expect(upsert).not.toHaveBeenCalled();
	});

	it("fails with a todo that says what to make when there is no dns provider", async () => {
		const { loader } = fakes({ withDns: false });
		const steps = await dnsRecordsStep(loader, "/r", false, io(LIST));
		expect(steps[0]).toMatchObject({
			status: "fail",
			message: "todo: no `dns` provider is configured; make CNAME status.example.dev -> target.example.net",
		});
	});

	it("reports a record the provider refuses and goes on", async () => {
		let calls = 0;
		const { loader } = fakes({
			upsert: async (_d, r) => {
				if (calls++ === 0) throw new Error("zone not found");
				return r;
			},
		});
		const steps = await dnsRecordsStep(loader, "/r", false, io(LIST));
		expect(steps.map((s) => s.status)).toEqual(["fail", "ok"]);
		expect(steps[0]?.message).toContain("zone not found");
	});

	it("is one failing step when the list cannot be read", async () => {
		const { loader } = fakes();
		const steps = await dnsRecordsStep(loader, "/r", false, io("{"));
		expect(steps).toEqual([expect.objectContaining({ step: "read dns-records.json", status: "fail" })]);
	});
});
