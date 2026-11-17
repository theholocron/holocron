import { describe, expect, it } from "vitest";

import type { Monitoring, MonitoringHeartbeatInput } from "../../../plugin/index.js";
import { MissingTokenError } from "../../../plugin/index.js";
import { heartbeatRows } from "./heartbeat-rows.js";

const beat = (over: Partial<MonitoringHeartbeatInput> = {}): MonitoringHeartbeatInput => ({
	name: "check-tokens",
	period: 1,
	periodUnit: "days",
	grace: 2,
	graceUnit: "hours",
	...over,
});

const provider = (declared: MonitoringHeartbeatInput[], list?: () => Promise<MonitoringHeartbeatInput[]>) =>
	({ heartbeats: declared, ...(list ? { listHeartbeats: list } : {}) }) as unknown as Monitoring;

describe("heartbeatRows", () => {
	it("adds no row when none is declared", async () => {
		expect(await heartbeatRows(provider([]))).toEqual([]);
	});

	it("is ok when each declared heartbeat has the declared period and grace", async () => {
		const rows = await heartbeatRows(provider([beat()], async () => [beat({ tags: ["ci"] })]));
		expect(rows).toEqual([expect.objectContaining({ status: "ok", detail: "1 of 1 match" })]);
	});

	it("fails for a missing heartbeat and for a period, grace or stated tag that differs", async () => {
		const missing = await heartbeatRows(provider([beat()], async () => []));
		expect(missing[0]?.problems).toEqual(["missing heartbeat check-tokens"]);
		const differs = await heartbeatRows(
			provider([beat({ tags: ["ci"] })], async () => [
				beat({ period: 7, grace: 5, graceUnit: "minutes", tags: [] }),
			])
		);
		expect(differs[0]).toMatchObject({ status: "fail" });
		expect(differs[0]?.problems).toEqual([
			"heartbeat check-tokens period: declared 1 days, found 7 days",
			"heartbeat check-tokens grace: declared 2 hours, found 5 minutes",
			"heartbeat check-tokens tags: declared ci, found none",
		]);
	});

	it("reports a heartbeat beyond the config as an info row, by name", async () => {
		const rows = await heartbeatRows(provider([beat()], async () => [beat(), beat({ name: "sync-specs" })]));
		expect(rows[0]?.status).toBe("ok");
		expect(rows[1]).toMatchObject({ status: "skip" });
		expect(rows[1]?.detail).toContain("sync-specs");
	});

	it("skips when the provider cannot list heartbeats or no token is available, and fails on another error", async () => {
		expect((await heartbeatRows(provider([beat()])))[0]?.status).toBe("skip");
		const noToken = await heartbeatRows(
			provider([beat()], async () => {
				throw new MissingTokenError("set CHECKLY_API_KEY");
			})
		);
		expect(noToken[0]?.status).toBe("skip");
		const broken = await heartbeatRows(
			provider([beat()], async () => {
				throw new Error("boom");
			})
		);
		expect(broken[0]).toMatchObject({ status: "fail", detail: "boom" });
	});
});
