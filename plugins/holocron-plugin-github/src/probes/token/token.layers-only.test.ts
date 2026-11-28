import type { ProbeRow } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../tokens.js", () => ({
	tokens: [{ envName: "HOLOCRON_READ_TOKEN", keyringKey: "github.read", expect: { layers: ["ci"] } }],
}));

const { tokenProbe } = await import("./token.js");

describe("token probe, for a token a layer holds with no permission rules", () => {
	it("tries nothing and prints no group", async () => {
		const rows: ProbeRow[] = [];
		const calls: string[] = [];
		const probe = tokenProbe({
			repo: "acme/widgets",
			baseUrl: "https://gh.test",
			fetch: (async (input: string | URL | Request) => {
				calls.push(String(input));
				return new Response("{}", { status: 200 });
			}) as typeof fetch,
			resolve: () => "tok",
			tokenNames: ["HOLOCRON_READ_TOKEN"],
		});
		await probe.run({
			args: ["--layer", "ci", "--token-name", "HOLOCRON_READ_TOKEN"],
			dryRun: false,
			say: (r) => void rows.push(r),
			secret: () => {},
			write: async () => undefined,
			cleanup: () => {},
		});
		expect(rows.map((r) => r.label)).toEqual(["token"]);
		expect(calls).toEqual(["https://gh.test/user"]);
	});
});
