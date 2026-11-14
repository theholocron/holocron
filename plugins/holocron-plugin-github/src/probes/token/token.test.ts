import type { ProbeRow } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { tokenProbe } from "./token.js";
import type { TokenProbeContext } from "./token.type.js";

type Reply = number | Error | { status: number; scopes?: string };

const NAMES = ["HOLOCRON_READ_TOKEN", "HOLOCRON_ADMIN_TOKEN", "HOLOCRON_ORG_TOKEN", "HOLOCRON_OTHER_TOKEN"];
const named = (name: string, ...more: string[]) => ["--token-name", name, ...more];

/** A fetch that answers by path (the part after the host); anything not listed is a 200. */
function fetcher(replies: Record<string, Reply>) {
	const calls: Array<{ url: string; auth: string | null }> = [];
	const fn = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		const headers = new Headers(init?.headers);
		calls.push({ url, auth: headers.get("authorization") });
		const path = url.replace("https://gh.test", "");
		const reply = replies[path] ?? replies[path.split("?")[0]!] ?? 200;
		if (reply instanceof Error) throw reply;
		const { status, scopes } = typeof reply === "number" ? { status: reply, scopes: undefined } : reply;
		return new Response("{}", { status, headers: scopes === undefined ? {} : { "x-oauth-scopes": scopes } });
	}) as typeof fetch;
	return { fn, calls };
}

async function check(
	replies: Record<string, Reply>,
	args: string[],
	over: Partial<TokenProbeContext> = {}
): Promise<{
	rows: ProbeRow[];
	secrets: Array<string | undefined>;
	calls: Array<{ url: string; auth: string | null }>;
}> {
	const { fn, calls } = fetcher(replies);
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const probe = tokenProbe({
		repo: "acme/widgets",
		baseUrl: "https://gh.test",
		fetch: fn,
		resolve: (name) => (NAMES.includes(name) ? `tok-${name}` : undefined),
		tokenNames: NAMES,
		...over,
	});
	await probe.run({
		...(args.length > 0 ? { args } : {}),
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async () => undefined,
		cleanup: () => {},
	});
	return { rows, secrets, calls };
}

const row = (rows: ProbeRow[], label: string) => rows.find((r) => r.label === label);

describe("token probe", () => {
	it("only reads, accepts another token, and never prints the token", async () => {
		const { rows, secrets, calls } = await check({}, []);
		expect(secrets).toEqual(["tok-HOLOCRON_READ_TOKEN"]);
		expect(JSON.stringify(rows)).not.toContain("tok-HOLOCRON_READ_TOKEN");
		expect(calls.every((c) => c.auth === "Bearer tok-HOLOCRON_READ_TOKEN")).toBe(true);
		const probe = tokenProbe({} as TokenProbeContext);
		expect(probe.writes).toBe(false);
		expect(probe.acceptsToken).toBe(true);
	});

	it("checks another token when --token-name names one", async () => {
		const { secrets } = await check({}, named("HOLOCRON_ADMIN_TOKEN"));
		expect(secrets).toEqual(["tok-HOLOCRON_ADMIN_TOKEN"]);
	});

	it("names the choices for a name that is not a token", async () => {
		const { rows } = await check({}, named("BOGUS"));
		expect(rows).toEqual([
			{ status: "fail", label: "BOGUS", detail: `not a GitHub token; use one of: ${NAMES.join(", ")}` },
		]);
	});

	it("stops on a token GitHub rejects", async () => {
		const { rows, calls } = await check({ "/user": 401 }, []);
		expect(rows).toEqual([
			{ status: "fail", label: "token", detail: "rejected by GitHub (401): expired, revoked or not a token" },
		]);
		expect(calls).toHaveLength(1);
	});

	it("fails when the API cannot be reached", async () => {
		const { rows } = await check({ "/user": new Error("offline") }, []);
		expect(rows).toEqual([{ status: "fail", label: "token", detail: "offline" }]);
	});

	it("says a fine-grained token has no scope list, and describes every permission with no layer", async () => {
		const { rows, calls } = await check(
			{
				"/repos/acme/widgets/actions/secrets": 403,
				"/repos/acme/widgets/pages": 404,
				"/repos/acme/widgets/environments": 500,
				"/orgs/acme/members": new Error("reset"),
			},
			[]
		);
		expect(row(rows, "token")).toMatchObject({ status: "ok", detail: expect.stringContaining("fine-grained") });
		expect(row(rows, "Contents")).toEqual({
			status: "ok",
			label: "Contents",
			detail: "read /repos/acme/widgets/contents",
		});
		expect(row(rows, "Secrets")).toEqual({ status: "info", label: "Secrets", detail: "no access (403)" });
		expect(row(rows, "Pages")).toEqual({ status: "info", label: "Pages", detail: "no access (404)" });
		expect(row(rows, "Environments")).toEqual({ status: "fail", label: "Environments", detail: "500" });
		expect(row(rows, "Organization: Members")).toEqual({
			status: "fail",
			label: "Organization: Members",
			detail: "reset",
		});
		expect(rows.some((r) => r.status === "heading")).toBe(false);
		expect(calls.map((c) => c.url)).toContain("https://gh.test/repos/acme/.github-private/contents");
		expect(calls.map((c) => c.url)).toContain("https://gh.test/orgs/acme/actions/variables?per_page=1");
	});

	it("shows a classic token's scopes, or that it has none", async () => {
		const some = await check({ "/user": { status: 200, scopes: "repo, read:org" } }, []);
		expect(row(some.rows, "token")?.detail).toBe(
			"classic (scopes: repo, read:org); each permission is also tried with a read"
		);
		const none = await check({ "/user": { status: 200, scopes: "" } }, []);
		expect(row(none.rows, "token")?.detail).toContain("scopes: none");
	});

	it("under a layer, groups what the token should and should not have", async () => {
		const { rows } = await check(
			{
				"/repos/acme/widgets/actions/secrets": 403,
				"/repos/acme/widgets/environments": 403,
				"/repos/acme/widgets/actions/variables": 403,
				"/repos/acme/widgets/properties/values": 200,
				"/orgs/acme/actions/secrets": 403,
			},
			["--layer", "ci", ...named("HOLOCRON_ADMIN_TOKEN")]
		);
		const labels = rows.map((r) => r.label);
		expect(labels.indexOf("Should have")).toBeLessThan(labels.indexOf("Should not have"));
		expect(row(rows, "Administration")).toMatchObject({ status: "ok" });
		// Required but unreachable fails, with what it came back with.
		expect(row(rows, "Secrets")).toEqual({ status: "fail", label: "Secrets", detail: "no access (403)" });
		// Absent and rightly missing is a bare ok.
		expect(row(rows, "Organization: Secrets")).toEqual({ status: "ok", label: "Organization: Secrets" });
	});

	it("fails a permission the layer must not have when the token has it", async () => {
		const { rows } = await check({}, ["--layer", "dev", ...named("HOLOCRON_READ_TOKEN")]);
		expect(row(rows, "Administration")).toMatchObject({
			status: "fail",
			detail: "read /repos/acme/widgets/actions/permissions",
		});
		expect(row(rows, "Contents")).toMatchObject({ status: "ok" });
	});

	it("fails a read that errors, whatever the layer expects", async () => {
		const { rows } = await check({ "/repos/acme/widgets/actions/runs": 500 }, [
			"--layer",
			"ci",
			...named("HOLOCRON_READ_TOKEN"),
		]);
		expect(row(rows, "Actions")).toMatchObject({ status: "fail", detail: "500" });
		const absent = await check({ "/repos/acme/widgets/actions/permissions": new Error("boom") }, [
			"--layer",
			"ci",
			...named("HOLOCRON_READ_TOKEN"),
		]);
		expect(row(absent.rows, "Administration")).toMatchObject({ status: "fail", detail: "boom" });
	});

	it("describes a token the layer does not declare, and a name outside the declaration", async () => {
		const undeclared = await check({}, ["--layer", "prod", ...named("HOLOCRON_ORG_TOKEN")]);
		expect(row(undeclared.rows, "prod")).toMatchObject({ status: "info" });
		expect(row(undeclared.rows, "Contents")).toMatchObject({ status: "ok" });
		const unlisted = await check({}, ["--layer", "ci", ...named("HOLOCRON_OTHER_TOKEN")]);
		expect(row(unlisted.rows, "ci")).toMatchObject({ status: "info" });
	});
});
