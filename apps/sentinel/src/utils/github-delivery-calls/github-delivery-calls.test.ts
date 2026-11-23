import { describe, expect, it, vi } from "vitest";

import {
	describeGitHubDelivery,
	GITHUB_DELIVERY_LOG_MSG,
	githubDeliveryFields,
	logGitHubDelivery,
	recordGitHubCall,
	runWithGitHubCalls,
} from "./github-delivery-calls.js";

describe("github delivery calls", () => {
	it("counts the calls made anywhere inside a delivery, and logs the totals once with what the delivery is", async () => {
		const logger = { info: vi.fn(), warn: vi.fn() };
		await runWithGitHubCalls(async () => {
			describeGitHubDelivery({ event: "pull_request.opened", repo: "acme/demo", delivery: "d-1" });
			recordGitHubCall(true);
			await Promise.all([
				Promise.resolve().then(() => recordGitHubCall(true)),
				Promise.resolve().then(() => recordGitHubCall(false)),
			]);
			expect(githubDeliveryFields()).toEqual({
				event: "pull_request.opened",
				repo: "acme/demo",
				delivery: "d-1",
			});
			logGitHubDelivery(logger);
		});
		expect(logger.info).toHaveBeenCalledTimes(1);
		expect(logger.info).toHaveBeenCalledWith(
			{ event: "pull_request.opened", repo: "acme/demo", delivery: "d-1", calls: 3, contents: 2 },
			GITHUB_DELIVERY_LOG_MSG
		);
	});

	it("keeps two deliveries that overlap apart", async () => {
		const logger = { info: vi.fn(), warn: vi.fn() };
		const delivery = (name: string, calls: number) =>
			runWithGitHubCalls(async () => {
				describeGitHubDelivery({ event: name });
				for (let i = 0; i < calls; i += 1) {
					await Promise.resolve();
					recordGitHubCall(false);
				}
				logGitHubDelivery(logger);
			});
		await Promise.all([delivery("a", 2), delivery("b", 5)]);
		const logged = logger.info.mock.calls.map((call) => call[0] as { event: string; calls: number });
		expect(logged.find((l) => l.event === "a")?.calls).toBe(2);
		expect(logged.find((l) => l.event === "b")?.calls).toBe(5);
	});

	it("logs nothing for a delivery that made no call", async () => {
		const logger = { info: vi.fn(), warn: vi.fn() };
		await runWithGitHubCalls(async () => {
			describeGitHubDelivery({ event: "ping" });
			logGitHubDelivery(logger);
		});
		expect(logger.info).not.toHaveBeenCalled();
	});

	it("does nothing, and describes nothing, outside a delivery", () => {
		const logger = { info: vi.fn(), warn: vi.fn() };
		describeGitHubDelivery({ event: "x" });
		recordGitHubCall(true);
		logGitHubDelivery(logger);
		expect(githubDeliveryFields()).toEqual({});
		expect(logger.info).not.toHaveBeenCalled();
	});
});
