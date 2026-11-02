import { describe, expect, it, vi } from "vitest";

import type { NotificationsLayout } from "../../plugin/index.js";
import { NOTIFICATIONS_WORKFLOW_PATH, notificationsWorkflowChecks } from "./notifications-workflow-checks.js";

const layout = (names: string[] = ["alerts", "deploys", "releases"]): NotificationsLayout => ({
	categories: [{ name: "OPS", channels: names.map((name) => ({ name, webhook: true })) }],
	roles: [{ name: "gatekeepers", secret: "HOLOCRON_NOTIFY_ALERT_ROLE" }],
});
const WORKFLOW = [
	"webhook: ${{ secrets.HOLOCRON_NOTIFY_WEBHOOK_DEPLOYS }}",
	"webhook: ${{ secrets.HOLOCRON_NOTIFY_WEBHOOK_ALERTS }}",
	"mention: ${{ secrets.HOLOCRON_NOTIFY_ALERT_ROLE }}",
	"webhook: ${{ secrets.HOLOCRON_NOTIFY_WEBHOOK_RELEASES }}",
].join("\n");
const source = (read: () => Promise<{ content: string; version: string } | null>) => ({
	providerName: "github",
	readFile: vi.fn(read),
});
const file = (content: string) => async () => ({ content, version: "v1" });
const run = (src: ReturnType<typeof source> | undefined, over: NotificationsLayout = layout()) =>
	notificationsWorkflowChecks({ layout: over, source: src, sourceMissingReason: "no `source` provider" });

describe("notificationsWorkflowChecks", () => {
	it("has no rows when the layout wires none of the alerts, deploys or releases webhooks", async () => {
		expect(await run(source(file(WORKFLOW)), layout(["general"]))).toEqual([]);
	});

	it("passes when the file is there and reads exactly the secrets the layout fills", async () => {
		const src = source(file(WORKFLOW));
		const rows = await run(src);
		expect(rows.map((r) => [r.id, r.status, r.detail])).toEqual([
			["notifications-workflow", "pass", "found"],
			["notifications-workflow-wiring", "pass", "3 of 3 wired"],
		]);
		expect(src.readFile).toHaveBeenCalledExactlyOnceWith(NOTIFICATIONS_WORKFLOW_PATH);
	});

	it("fails when the file is missing, and does not check its wiring", async () => {
		const rows = await run(source(async () => null));
		expect(rows.map((r) => r.status)).toEqual(["fail", "skip"]);
		expect(rows[0]!.problems[0]).toContain("is missing");
		expect(rows[1]!.detail).toBe("not checked: the workflow is missing");
	});

	it("names a secret the workflow reads that the layout does not fill", async () => {
		const rows = await run(source(file(`${WORKFLOW}\nx: \${{ secrets.HOLOCRON_NOTIFY_WEBHOOK_UPTIME }}`)));
		expect(rows[1]!.status).toBe("fail");
		expect(rows[1]!.problems).toEqual([
			"HOLOCRON_NOTIFY_WEBHOOK_UPTIME: the workflow reads it but the layout fills no such secret",
		]);
	});

	it("names a webhook the layout fills that the workflow never posts through", async () => {
		const rows = await run(source(file(WORKFLOW.replace("HOLOCRON_NOTIFY_WEBHOOK_RELEASES", "OTHER"))));
		expect(rows[1]!.problems).toEqual([
			"HOLOCRON_NOTIFY_WEBHOOK_RELEASES: the layout fills it but the workflow never posts through it",
		]);
	});

	it("matches secret names without regard to case", async () => {
		const rows = await run(source(file(WORKFLOW)), {
			categories: [
				{
					name: "OPS",
					channels: [{ name: "alerts", webhook: { secret: "holocron_notify_webhook_alerts" } }],
				},
			],
		});
		expect(rows[1]!.problems).toEqual([
			"HOLOCRON_NOTIFY_WEBHOOK_DEPLOYS: the workflow reads it but the layout fills no such secret",
			"HOLOCRON_NOTIFY_ALERT_ROLE: the workflow reads it but the layout fills no such secret",
			"HOLOCRON_NOTIFY_WEBHOOK_RELEASES: the workflow reads it but the layout fills no such secret",
		]);
	});

	it("fails the file row, and skips the wiring, when the provider throws", async () => {
		const rows = await run(
			source(async () => {
				throw new Error("boom");
			})
		);
		expect(rows.map((r) => r.status)).toEqual(["fail", "skip"]);
		expect(rows[0]!.detail).toContain("boom");
	});

	it("skips both rows with the reason when there is no source provider", async () => {
		const rows = await run(undefined);
		expect(rows.map((r) => [r.status, r.detail])).toEqual([
			["skip", "no `source` provider"],
			["skip", "not checked: the workflow could not be read"],
		]);
	});

	it("skips both rows when the provider cannot read a file", async () => {
		const rows = await run({ providerName: "plain" } as never);
		expect(rows[0]!.detail).toBe("the `plain` provider cannot read a file");
	});
});
