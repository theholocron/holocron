import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import type { MonitoringCheckInput } from "../../plugin/index.js";
import { runMonitoringRunResolved } from "./monitoring-run-resolved.js";

const CHECK_A: MonitoringCheckInput = {
	name: "uptime",
	url: "https://prod.example.com",
	assertions: [{ source: "status_code", comparison: "equals", target: "200" }],
};

describe("runMonitoringRunResolved", () => {
	it("runs checks with no headers when vercelProject is omitted, even if a bypassSecret is given", async () => {
		const runCheck = vi.fn().mockResolvedValue({ passed: true, status: 200, failures: [] });
		const verify = vi.fn();

		const report = await runMonitoringRunResolved({
			checks: [CHECK_A],
			url: "https://x.vercel.app",
			bypassSecret: "secret",
			print: () => {},
			runCheck,
			verify,
		});

		expect(report.status).toBe("ok");
		expect(verify).not.toHaveBeenCalled();
		expect(runCheck).toHaveBeenCalledWith(CHECK_A, { url: "https://x.vercel.app" });
	});

	it("verifies project ownership and attaches the bypass header once verification passes", async () => {
		const runCheck = vi.fn().mockResolvedValue({ passed: true, status: 200, failures: [] });
		const verify = vi.fn().mockResolvedValue(true);

		await runMonitoringRunResolved({
			checks: [CHECK_A],
			url: "https://sentinel-abc.vercel.app",
			vercelProject: "prj_sentinel",
			vercelToken: "tok",
			bypassSecret: "secret",
			print: () => {},
			runCheck,
			verify,
		});

		expect(verify).toHaveBeenCalledWith("https://sentinel-abc.vercel.app", "prj_sentinel", "tok", {});
		expect(runCheck).toHaveBeenCalledWith(CHECK_A, {
			url: "https://sentinel-abc.vercel.app",
			headers: { "x-vercel-protection-bypass": "secret" },
		});
	});

	it("passes teamId through to verify when given", async () => {
		const verify = vi.fn().mockResolvedValue(true);

		await runMonitoringRunResolved({
			checks: [CHECK_A],
			url: "https://x.vercel.app",
			vercelProject: "prj_sentinel",
			vercelToken: "tok",
			vercelTeamId: "team_abc",
			print: () => {},
			runCheck: vi.fn().mockResolvedValue({ passed: true, status: 200, failures: [] }),
			verify,
		});

		expect(verify).toHaveBeenCalledWith("https://x.vercel.app", "prj_sentinel", "tok", { teamId: "team_abc" });
	});

	it("refuses to run anything when verification fails — never attaches the secret to an unverified URL", async () => {
		const runCheck = vi.fn();
		const verify = vi.fn().mockResolvedValue(false);
		const lines: string[] = [];

		const report = await runMonitoringRunResolved({
			checks: [CHECK_A],
			url: "https://evil-attacker-project.vercel.app",
			vercelProject: "prj_sentinel",
			vercelToken: "tok",
			bypassSecret: "secret",
			print: (l) => lines.push(l),
			runCheck,
			verify,
		});

		expect(report).toEqual({ status: "fail", checks: [] });
		expect(runCheck).not.toHaveBeenCalled();
		expect(lines.some((l) => l.includes("does not resolve to a deployment of Vercel project"))).toBe(true);
	});

	it("refuses to run when vercelProject is given but no vercelToken is available to verify with", async () => {
		const runCheck = vi.fn();
		const verify = vi.fn();
		const lines: string[] = [];

		const report = await runMonitoringRunResolved({
			checks: [CHECK_A],
			url: "https://sentinel-abc.vercel.app",
			vercelProject: "prj_sentinel",
			bypassSecret: "secret",
			print: (l) => lines.push(l),
			runCheck,
			verify,
		});

		expect(report).toEqual({ status: "fail", checks: [] });
		expect(runCheck).not.toHaveBeenCalled();
		expect(verify).not.toHaveBeenCalled();
		expect(lines.some((l) => l.includes("no Vercel token is available"))).toBe(true);
	});

	it("verifies but attaches no header when verification passes and no bypassSecret was given", async () => {
		const runCheck = vi.fn().mockResolvedValue({ passed: true, status: 200, failures: [] });
		const verify = vi.fn().mockResolvedValue(true);

		await runMonitoringRunResolved({
			checks: [CHECK_A],
			url: "https://sentinel-abc.vercel.app",
			vercelProject: "prj_sentinel",
			vercelToken: "tok",
			print: () => {},
			runCheck,
			verify,
		});

		expect(runCheck).toHaveBeenCalledWith(CHECK_A, { url: "https://sentinel-abc.vercel.app" });
	});

	it("defaults print to console.log when none is injected", async () => {
		const report = await runMonitoringRunResolved({
			checks: [CHECK_A],
			url: "https://sentinel-abc.vercel.app",
			vercelProject: "prj_sentinel",
			// No vercelToken, no print -- exercises resolveVercelBypassHeaders'
			// own `input.print ?? console.log` default branch directly.
		});
		expect(report).toEqual({ status: "fail", checks: [] });
	});

	it("falls back to reportChecks' own defaults (print/logger/runCheck) when none are given here either", async () => {
		// No vercelProject -- verification is skipped entirely, so this
		// reaches the real reportChecks call with nothing but checks/url.
		// 127.0.0.1 refusing a connection is immediate and has no network/DNS
		// dependency, matching run-check.test.ts's own pattern for exercising
		// a real default without a real external call.
		const report = await runMonitoringRunResolved({ checks: [CHECK_A], url: "http://127.0.0.1:1/" });
		expect(report.status).toBe("fail");
		expect(report.checks[0]?.requestError).toBeTruthy();
	});

	it("forwards an injected logger through to reportChecks", async () => {
		const log = fakeLogger();
		const runCheck = vi.fn().mockResolvedValue({ passed: true, status: 200, failures: [] });

		await runMonitoringRunResolved({
			checks: [CHECK_A],
			url: "https://pr-preview.example.com",
			print: () => {},
			logger: log,
			runCheck,
		});

		expect(log.info).toHaveBeenCalledWith(
			expect.objectContaining({ url: "https://pr-preview.example.com" }),
			"monitoring check: done"
		);
	});

	it("uses the real verifyVercelDeploymentProject when none is injected", async () => {
		// Exercises the `?? verifyVercelDeploymentProject` default branch without a real network call --
		// an unparseable "url" fails fast inside verifyVercelDeploymentProject itself.
		const report = await runMonitoringRunResolved({
			checks: [CHECK_A],
			url: "not a url",
			vercelProject: "prj_sentinel",
			vercelToken: "tok",
			print: () => {},
		});
		expect(report.status).toBe("fail");
	});
});
