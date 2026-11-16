import type { Coverage, CoverageTokenCheck, ProbeRow } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { parseTokenArgs } from "./parse-token-args.js";
import { tokenProbe } from "./token.js";

async function check(
	result: CoverageTokenCheck | Error,
	over: { args?: string[]; repo?: string | undefined | null } = {}
) {
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const coverage = {
		key: "coverage",
		providerName: "codecov",
		checkToken: async () => {
			if (result instanceof Error) throw result;
			return result;
		},
	} satisfies Coverage;
	const probe = tokenProbe({
		token: () => "cc-secret",
		coverage: () => coverage,
		repo: over.repo === null ? undefined : (over.repo ?? "theholocron/holocron"),
	});
	await probe.run({
		...(over.args ? { args: over.args } : {}),
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async () => undefined,
		cleanup: () => {},
	});
	return { rows, secrets, probe };
}

const row = (rows: ProbeRow[], label: string) => rows.find((r) => r.label === label);

describe("token probe", () => {
	it("only reads, accepts another token, and never prints the token", async () => {
		const { probe, secrets, rows } = await check({ outcome: "accepted", repoPrivate: true });
		expect(probe.writes).toBe(false);
		expect(probe.acceptsToken).toBe(true);
		expect(secrets).toEqual(["cc-secret"]);
		expect(JSON.stringify(rows)).not.toContain("cc-secret");
	});

	it("is ok when Codecov answers for a private repository, and always says permissions are not checked", async () => {
		const { rows } = await check({ outcome: "accepted", repoPrivate: true });
		expect(rows).toEqual([
			{ status: "ok", label: "token", detail: "set" },
			{ status: "ok", label: "Codecov API", detail: "answered for theholocron/holocron with this token" },
			{
				status: "info",
				label: "permissions",
				detail: "Codecov has no permission model and reports none, so they are not checked",
			},
		]);
	});

	it("notes that a public repository answers without a token", async () => {
		const { rows } = await check({ outcome: "accepted", repoPrivate: false });
		expect(row(rows, "public repository")?.status).toBe("info");
	});

	it("is info, not fail, when Codecov refuses: an upload token looks the same as a bad API token", async () => {
		const { rows } = await check({ outcome: "refused", status: 401 });
		expect(row(rows, "Codecov API")).toMatchObject({ status: "info" });
		expect(row(rows, "Codecov API")?.detail).toMatch(/upload token.*cannot be checked/);
		expect(rows.some((r) => r.status === "fail")).toBe(false);
	});

	it("is info when the repository is not found", async () => {
		const { rows } = await check({ outcome: "not-found", status: 404 });
		expect(row(rows, "repository")).toMatchObject({ status: "info" });
	});

	it("fails for an error that is not about access", async () => {
		const { rows } = await check(new Error("network down"));
		expect(row(rows, "Codecov API")).toMatchObject({ status: "fail", detail: "network down" });
	});

	it("fails with the text of a thrown non-Error", async () => {
		const rows: ProbeRow[] = [];
		const probe = tokenProbe({
			token: () => "t",
			coverage: () =>
				({
					key: "coverage",
					providerName: "codecov",
					checkToken: () => Promise.reject("odd"),
				}) satisfies Coverage,
			repo: "a/b",
		});
		await probe.run({
			dryRun: false,
			say: (r) => void rows.push(r),
			secret: () => {},
			write: async () => undefined,
			cleanup: () => {},
		});
		expect(row(rows, "Codecov API")).toMatchObject({ status: "fail", detail: "odd" });
	});

	it("says there is no repository to ask about, without a request", async () => {
		const { rows } = await check({ outcome: "accepted" }, { repo: null });
		expect(row(rows, "repository")).toMatchObject({ status: "info" });
		expect(row(rows, "Codecov API")).toBeUndefined();
	});

	it("accepts the layer that holds the token, and the token name", async () => {
		const { rows } = await check(
			{ outcome: "accepted" },
			{ args: ["--layer", "ci", "--token-name", "HOLOCRON_CODECOV_UPLOAD_TOKEN"] }
		);
		expect(row(rows, "ci")).toMatchObject({ status: "ok" });
	});

	it("only describes a layer the token is not declared for", async () => {
		const { rows } = await check({ outcome: "accepted" }, { args: ["--layer=local"] });
		expect(row(rows, "local")).toMatchObject({ status: "info" });
	});
});

describe("parseTokenArgs", () => {
	it("reads the layer and token name in either spelling, and none when not given", () => {
		expect(parseTokenArgs([])).toEqual({});
		expect(parseTokenArgs(["--unknown", "x", "--layer", "ci"])).toEqual({ layer: "ci" });
		expect(parseTokenArgs(["--layer", "ci", "--token-name", "X"])).toEqual({ layer: "ci", tokenName: "X" });
		expect(parseTokenArgs(["--layer=dev", "--token-name=Y"])).toEqual({ layer: "dev", tokenName: "Y" });
	});
});
