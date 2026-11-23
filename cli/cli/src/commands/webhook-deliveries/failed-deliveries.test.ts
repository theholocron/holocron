import type { GitHubAppDelivery } from "@theholocron/github-client";
import { describe, expect, it } from "vitest";

import { failedDeliveries } from "./failed-deliveries.js";

const delivery = (id: number, guid: string, at: string, statusCode: number, redelivery = false): GitHubAppDelivery => ({
	id,
	guid,
	deliveredAt: at,
	redelivery,
	statusCode,
	status: statusCode >= 200 && statusCode < 300 ? "OK" : `Invalid HTTP Response: ${statusCode}`,
	event: "check_run",
	action: "completed",
	installationId: 7,
});

describe("failedDeliveries", () => {
	it("is empty when every delivery succeeded, and for no deliveries", () => {
		expect(failedDeliveries([])).toEqual([]);
		expect(
			failedDeliveries([
				delivery(1, "a", "2026-11-22T10:00:00Z", 200),
				delivery(2, "b", "2026-11-22T10:01:00Z", 204),
			])
		).toEqual([]);
	});

	it("returns the failures oldest first, a 3xx, 4xx, 5xx and no answer (0) included", () => {
		const out = failedDeliveries([
			delivery(5, "e", "2026-11-22T10:05:00Z", 500),
			delivery(4, "d", "2026-11-22T10:04:00Z", 0),
			delivery(3, "c", "2026-11-22T10:03:00Z", 404),
			delivery(2, "b", "2026-11-22T10:02:00Z", 301),
			delivery(1, "a", "2026-11-22T10:01:00Z", 200),
		]);
		expect(out.map((d) => d.id)).toEqual([2, 3, 4, 5]);
	});

	it("treats a failure that was redelivered successfully as done", () => {
		const out = failedDeliveries([
			delivery(1, "a", "2026-11-22T10:00:00Z", 500),
			delivery(2, "a", "2026-11-22T10:05:00Z", 200, true),
		]);
		expect(out).toEqual([]);
	});

	it("returns a delivery whose redelivery failed too once, as its latest attempt", () => {
		const out = failedDeliveries([
			delivery(1, "a", "2026-11-22T10:00:00Z", 500),
			delivery(2, "a", "2026-11-22T10:05:00Z", 502, true),
		]);
		expect(out.map((d) => d.id)).toEqual([2]);
	});

	it("orders deliveries made at the same instant by id, whatever order they came in", () => {
		const out = failedDeliveries([
			delivery(9, "z", "2026-11-22T10:00:00Z", 500),
			delivery(3, "y", "2026-11-22T10:00:00Z", 500),
		]);
		expect(out.map((d) => d.id)).toEqual([3, 9]);
	});

	it("does not let an older successful attempt hide a newer failure", () => {
		const out = failedDeliveries([
			delivery(2, "a", "2026-11-22T10:05:00Z", 500, true),
			delivery(1, "a", "2026-11-22T10:00:00Z", 200),
		]);
		expect(out.map((d) => d.id)).toEqual([2]);
	});
});
