import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { getLogger } from "../../../observability/logger/index.js";
import { ProviderApiError } from "../../../plugin/index.js";
import { classify403, formatStep, runStep } from "./run-step.js";

vi.mock("../../../observability/logger/index.js", () => ({ getLogger: vi.fn(() => fakeLogger()) }));

describe("runStep", () => {
	it("returns dry-run status without calling body when dryRun is true", async () => {
		let called = false;
		const result = await runStep("source", "do something", true, async () => {
			called = true;
		});
		expect(called).toBe(false);
		expect(result).toEqual({ capability: "source", step: "do something", status: "dry-run" });
	});

	it("returns ok with message when body resolves a string", async () => {
		const result = await runStep("source", "step", false, async () => "done");
		expect(result).toEqual({ capability: "source", step: "step", status: "ok", message: "done" });
	});

	it("returns ok without message when body resolves void", async () => {
		const result = await runStep("source", "step", false, async () => {});
		expect(result).toEqual({ capability: "source", step: "step", status: "ok" });
	});

	it("skips when ProviderApiError status matches skipCodes", async () => {
		const result = await runStep(
			"source",
			"step",
			false,
			async () => {
				throw new ProviderApiError("already exists", 422);
			},
			{ skipCodes: [422] }
		);
		expect(result.status).toBe("skip");
	});

	it("returns fail with permissions reason for non-plan 403", async () => {
		const result = await runStep("source", "step", false, async () => {
			throw new ProviderApiError("Forbidden", 403);
		});
		expect(result.status).toBe("fail");
		expect(result.reason).toBe("permissions");
	});

	it("returns skip with plan reason for plan-restriction 403", async () => {
		const result = await runStep("source", "step", false, async () => {
			throw new ProviderApiError("Advanced security not available on this plan", 403);
		});
		expect(result.status).toBe("skip");
		expect(result.reason).toBe("plan");
	});

	it("returns fail for non-403 ProviderApiError (line 57 false branch)", async () => {
		const result = await runStep("source", "step", false, async () => {
			throw new ProviderApiError("Server error", 500);
		});
		expect(result.status).toBe("fail");
		expect(result.message).toBe("Server error");
	});

	it("adds what the provider said to a failing ProviderApiError, on one line with control characters gone", async () => {
		const result = await runStep("monitoring", "step", false, async () => {
			throw new ProviderApiError(
				"Checkly POST /dashboards → 400",
				400,
				"header is\nrequired\u001b[31m and\r\nlong"
			);
		});
		expect(result).toMatchObject({ status: "fail" });
		expect(result.message).toBe("Checkly POST /dashboards → 400: header is required [31m and long");
	});

	it("cuts a long response body, keeping its start", async () => {
		const result = await runStep("monitoring", "step", false, async () => {
			throw new ProviderApiError("Checkly POST /dashboards → 400", 400, `START${"x".repeat(1000)}END`);
		});
		expect(result.message).toMatch(/^Checkly POST \/dashboards → 400: START/);
		expect(result.message).toMatch(/…$/);
		expect(result.message).not.toContain("END");
	});

	it("adds it to a plan-restriction skip and to a skipped status code too", async () => {
		const plan = await runStep("source", "step", false, async () => {
			throw new ProviderApiError("Forbidden", 403, "upgrade your plan");
		});
		expect(plan).toMatchObject({ status: "skip", reason: "plan", message: "Forbidden: upgrade your plan" });
		const skipped = await runStep(
			"source",
			"step",
			false,
			async () => {
				throw new ProviderApiError("exists", 422, "name taken");
			},
			{ skipCodes: [422] }
		);
		expect(skipped).toMatchObject({ status: "skip", message: "exists: name taken" });
	});

	it("keeps the provider's response text out of the log", async () => {
		const log = fakeLogger();
		vi.mocked(getLogger).mockReturnValue(log);
		await runStep("monitoring", "step", false, async () => {
			throw new ProviderApiError("Checkly POST /dashboards → 400", 400, "secret-looking response text");
		});
		const logged = JSON.stringify([...log.warn.mock.calls, ...log.info.mock.calls]);
		expect(logged).toContain("Checkly POST /dashboards → 400");
		expect(logged).not.toContain("secret-looking");
	});

	it("returns fail with String(err) when a non-Error value is thrown (line 68 false branch)", async () => {
		const result = await runStep("source", "step", false, async () => {
			throw "raw string error";
		});
		expect(result.status).toBe("fail");
		expect(result.message).toBe("raw string error");
	});
});

describe("classify403", () => {
	it("returns plan for advanced security message", () => {
		expect(classify403(new ProviderApiError("Advanced security not enabled for this repository", 403))).toBe(
			"plan"
		);
	});

	it("returns plan for upgrade message", () => {
		expect(classify403(new ProviderApiError("Please upgrade your plan", 403))).toBe("plan");
	});

	it("returns permissions for generic 403", () => {
		expect(classify403(new ProviderApiError("Forbidden", 403))).toBe("permissions");
	});
});

describe("formatStep", () => {
	it("formats ok step with success style", () => {
		const out = formatStep({ capability: "source", step: "do thing", status: "ok" });
		expect(out).toContain("do thing");
	});

	it("formats fail step", () => {
		const out = formatStep({ capability: "source", step: "bad thing", status: "fail" });
		expect(out).toContain("bad thing");
	});

	it("formats dry-run step with ellipsis prefix", () => {
		const out = formatStep({ capability: "source", step: "would do", status: "dry-run" });
		expect(out).toContain("would do");
	});

	it("includes message in parens when present", () => {
		const out = formatStep({ capability: "source", step: "step", status: "ok", message: "details" });
		expect(out).toContain("(details)");
	});

	it("appends [permissions] tag for permissions reason", () => {
		const out = formatStep({ capability: "source", step: "step", status: "fail", reason: "permissions" });
		expect(out).toContain("[permissions]");
	});

	it("appends [plan restriction] tag for plan reason", () => {
		const out = formatStep({ capability: "source", step: "step", status: "skip", reason: "plan" });
		expect(out).toContain("[plan restriction]");
	});
});
