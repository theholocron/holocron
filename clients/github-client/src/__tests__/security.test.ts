import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN, REPO } from "./helpers.js";

describe("security", () => {
	it("PUT vulnerability-alerts", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.security.enableVulnerabilityAlerts(REPO);
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toContain("/vulnerability-alerts");
	});

	it("PUT automated-security-fixes", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.security.enableAutomatedSecurityFixes(REPO);
		expect(calls[0]?.url).toContain("/automated-security-fixes");
	});

	it("PATCH repo for enableSecretScanning", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.security.enableSecretScanning(REPO);
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.body).toMatchObject({
			security_and_analysis: { secret_scanning: { status: "enabled" } },
		});
	});

	it("PUT private-vulnerability-reporting", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.security.enablePrivateVulnerabilityReporting(REPO);
		expect(calls[0]?.url).toContain("/private-vulnerability-reporting");
	});

	it("PATCH repo for enableDependencyGraph", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.security.enableDependencyGraph(REPO);
		expect(calls[0]?.body).toMatchObject({
			security_and_analysis: { dependency_graph: { status: "enabled" } },
		});
	});

	it("PATCH code-scanning/default-setup to enable", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { run_id: 42, run_url: "https://github.com/run/42" } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.security.enableCodeScanning(REPO);
		expect(calls[0]?.url).toContain("/code-scanning/default-setup");
		expect(calls[0]?.body).toMatchObject({ state: "configured" });
		expect(result.run_id).toBe(42);
	});

	it("PATCH code-scanning/default-setup to disable", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.security.disableDefaultCodeScanning(REPO);
		expect(calls[0]?.body).toMatchObject({ state: "not-configured" });
	});
});
