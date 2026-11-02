import { describe, expect, it, vi } from "vitest";

import type { Notifications } from "../../plugin/index.js";
import { postDoctorReport } from "./post-doctor-report.js";

const report = { checks: [], summary: { pass: 3, fail: 0, skip: 0 } };
const provider = (postMessage?: Notifications["postMessage"]) =>
	({ providerName: "discord", postMessage }) as unknown as Notifications;

describe("postDoctorReport", () => {
	it("posts the formatted result to the channel", async () => {
		const postMessage = vi.fn().mockResolvedValue(undefined);
		expect(await postDoctorReport(provider(postMessage), "alerts", report)).toBe("posted to #alerts");
		expect(postMessage).toHaveBeenCalledWith("alerts", "✅ holocron doctor notifications: 3 ok, 0 fail, 0 skipped");
	});

	it("says so when the provider cannot post as the bot", async () => {
		expect(await postDoctorReport(provider(), "alerts", report)).toMatch(
			/^not posted: the `discord` provider cannot/
		);
	});

	it("reports a post that failed, without throwing", async () => {
		const postMessage = vi.fn().mockRejectedValue(new Error("no such channel"));
		expect(await postDoctorReport(provider(postMessage), "alerts", report)).toBe("not posted: no such channel");
	});
});
