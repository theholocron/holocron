import type { ProbeRow } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { AuthError, tokens } from "./auth.js";
import { AUTH_HINT, createPlugin, issues, projects } from "./index.js";
import { fakeLinear, nodes, TEAM } from "./test-helpers.js";
import { verifyToken } from "./verify-token.js";

const VIEWER = {
	viewer: { id: "u", name: "Luke", displayName: "luke", email: "l@x.io" },
	organization: { id: "o", name: "Acme", urlKey: "acme" },
};

describe("createPlugin", () => {
	it("offers the issues and projects capabilities", () => {
		const plugin = createPlugin({ team: "ENG", cliToken: "lin_api_x" });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-linear");
		expect(Object.keys(plugin.capabilities)).toEqual(["issues", "projects"]);
		expect(plugin.capabilities.issues()).toMatchObject({ key: "issues", providerName: "linear" });
		expect(plugin.capabilities.projects()).toMatchObject({ key: "projects", providerName: "linear" });
	});

	it("passes the lifecycle state names to issues", async () => {
		const { fetch } = fakeLinear([
			[/teams\(first/, { teams: nodes([TEAM]) }],
			[/workflowStates\(first/, { workflowStates: nodes([]) }],
			[/viewer/, VIEWER],
		]);
		const cap = issues({ team: "ENG", cliToken: "t", fetch, states: { inProgress: "Doing" } });
		const report = await cap.doctor();
		expect(report.lifecycle[0]).toMatchObject({ slot: "inProgress", resolved: false });
	});

	it("needs a team", () => {
		expect(() => issues({ cliToken: "t" })).toThrow(/needs a `team` option/);
		expect(() => projects({ cliToken: "t" })).toThrow(/needs a `team` option/);
	});

	it("needs a token", () => {
		expect(() => issues({ team: "ENG", env: {}, keyring: () => null })).toThrow(AuthError);
	});

	it("exposes the token, the hint and the connection probe", async () => {
		expect(tokens).toEqual([
			{ envName: "HOLOCRON_LINEAR_TOKEN", vendorEnvName: "LINEAR_API_KEY", keyringKey: "linear" },
		]);
		expect(AUTH_HINT).toMatch(/holocron new token linear/);

		const rows: ProbeRow[] = [];
		const { fetch } = fakeLinear([[/viewer/, VIEWER]]);
		await createPlugin({ team: "ENG", cliToken: "lin_api_x", fetch }).probes.connection.run({
			dryRun: false,
			say: (r) => void rows.push(r),
			secret: () => {},
			write: async () => undefined,
			cleanup: () => {},
		});
		expect(rows.find((r) => r.label === "token")).toMatchObject({ status: "ok" });
		expect(rows.at(-1)?.label).toBe("accepted");
	});
});

describe("verifyToken", () => {
	it("names the user and workspace", async () => {
		const { fetch } = fakeLinear([[/viewer/, VIEWER]]);
		expect(await verifyToken("lin_api_x", { fetch })).toEqual({ ok: true, subject: "luke @ Acme" });
	});

	it("returns the message when Linear refuses", async () => {
		const fetch = (async () =>
			new Response(
				JSON.stringify({ errors: [{ message: "Authentication required" }] })
			)) as typeof globalThis.fetch;
		const result = await verifyToken("bad", { fetch });
		expect(result).toMatchObject({ ok: false });
		expect((result as { message: string }).message).toMatch(/Authentication required/);
	});
});
