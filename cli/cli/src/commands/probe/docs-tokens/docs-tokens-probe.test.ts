import { describe, expect, it } from "vitest";

import type { ProbeContext, ProbeRow } from "../../../plugin/index.js";
import type { PluginToken } from "../../auth/index.js";
import type { DocsTokensIo, PluginAuthSource } from "./docs-tokens.type.js";
import { docsTokensProbe } from "./docs-tokens-probe.js";

function auth(plugin: string, env: string, vendor: string): PluginAuthSource {
	return { plugin, text: `envName: "${env}",\nvendorEnvName: "${vendor}",\nkeyringService: "${plugin}",` };
}

/** Eleven plugins, each with a row, so the sanity check passes. */
const names = Array.from({ length: 11 }, (_, i) => `p${i}`);
const files = names.map((n) => auth(`holocron-plugin-${n}`, `HOLOCRON_${n}`, `${n}_KEY`));
const rows = names.map((n) => `| \`${n}\` | x | \`HOLOCRON_${n}\` | \`${n}_KEY\` | \`holocron-plugin-${n}\` |`);

function makeIo(overrides: Partial<DocsTokensIo> = {}): DocsTokensIo {
	return {
		page: () => rows.join("\n"),
		authFiles: () => files,
		declarations: async () => [],
		setupSource: () => "",
		...overrides,
	};
}

async function run(io: DocsTokensIo): Promise<ProbeRow[]> {
	const out: ProbeRow[] = [];
	const ctx = { dryRun: false, say: (row: ProbeRow) => out.push(row) } as unknown as ProbeContext;
	await docsTokensProbe(io).run(ctx);
	return out;
}

const fails = (out: ProbeRow[]): ProbeRow[] => out.filter((r) => r.status === "fail");

describe("docsTokensProbe", () => {
	it("is a probe that writes nothing", () => {
		const probe = docsTokensProbe(makeIo());
		expect(probe.writes).toBe(false);
		expect(probe.summary).toMatch(/tokens\.mdx/);
	});

	it("passes when every name is in its plugin's row", async () => {
		const out = await run(makeIo());
		expect(fails(out)).toEqual([]);
		expect(out.filter((r) => r.status === "ok")).toHaveLength(12);
	});

	it("fails a plugin whose name is missing from its row, even if it is elsewhere on the page", async () => {
		const page = [
			...rows.slice(0, 5),
			"| `p5` | x | `HOLOCRON_p5` | `holocron-plugin-p5` |",
			...rows.slice(6),
			"`p5_KEY`",
		];
		const out = fails(await run(makeIo({ page: () => page.join("\n") })));
		expect(out).toEqual([{ status: "fail", label: "holocron-plugin-p5", detail: "not in tokens.mdx: p5_KEY" }]);
	});

	it("fails a plugin with names but no row", async () => {
		const out = fails(await run(makeIo({ page: () => rows.slice(1).join("\n") })));
		expect(out).toEqual([
			{ status: "fail", label: "holocron-plugin-p0", detail: "no provider-table row in tokens.mdx" },
		]);
	});

	it("lets a plugin with its own tables match anywhere on the page", async () => {
		const github = auth("holocron-plugin-github", "HOLOCRON_GITHUB_TOKEN", "GH_TOKEN");
		const authFiles = (): PluginAuthSource[] => [...files, github];
		const page = [...rows, "| `HOLOCRON_GITHUB_TOKEN` | `GH_TOKEN` | `holocron-plugin-github` |"].join("\n");
		expect(fails(await run(makeIo({ page: () => page, authFiles })))).toEqual([]);
		expect(fails(await run(makeIo({ authFiles })))).toEqual([
			{
				status: "fail",
				label: "holocron-plugin-github",
				detail: "not in tokens.mdx: HOLOCRON_GITHUB_TOKEN, GH_TOKEN, holocron-plugin-github",
			},
		]);
	});

	it("needs no row for a plugin with nothing to resolve", async () => {
		const op = { plugin: "holocron-plugin-1password", text: "export const x = 1;" };
		const out = await run(makeIo({ authFiles: () => [...files, op] }));
		expect(fails(out)).toEqual([]);
		expect(out).toContainEqual({ status: "ok", label: "holocron-plugin-1password", detail: "0 documented" });
	});

	it("fails when too few plugin resolvers are found", async () => {
		const out = fails(await run(makeIo({ authFiles: () => [] })));
		expect(out).toHaveLength(1);
		expect(out[0]!.label).toBe("plugin resolvers");
		expect(out[0]!.detail).toMatch(/found 0/);
	});

	it("checks the setup command's own names against the whole page", async () => {
		const setupSource = (): string => 'envName: "HOLOCRON_SETUP", keyringKey: "setup-key"';
		expect(fails(await run(makeIo({ setupSource })))).toEqual([
			{ status: "fail", label: "setup", detail: "not in tokens.mdx: HOLOCRON_SETUP, setup-key" },
		]);
		const page = `${rows.join("\n")}\n\`HOLOCRON_SETUP\` \`setup-key\``;
		expect(fails(await run(makeIo({ setupSource, page: () => page })))).toEqual([]);
	});

	describe("permissions", () => {
		const table = [
			"### What each Acme token needs",
			"",
			"| Permission | Id | `local` | `ci` |",
			"| --- | --- | --- | --- |",
			"| Read | `read` | `required` | `absent` |",
			"| Write | `write` | `required` | - |",
		].join("\n");
		const token = (permissions: PluginToken["expect"]): PluginToken => ({
			envName: "HOLOCRON_ACME_TOKEN",
			keyringKey: "acme",
			expect: permissions,
		});
		const declared = token({
			permissions: { local: { read: "required", write: "required" }, ci: { read: "absent" } },
		});
		const withTokens = (tokens: PluginToken[], page = table): DocsTokensIo =>
			makeIo({
				page: () => `${rows.join("\n")}\n${page}`,
				declarations: async () => [{ plugin: "holocron-plugin-acme", tokens }],
			});

		it("passes when the table and the declaration agree", async () => {
			const out = await run(withTokens([declared]));
			expect(fails(out)).toEqual([]);
			expect(out).toContainEqual({
				status: "ok",
				label: "holocron-plugin-acme",
				detail: "permissions match tokens.mdx",
			});
		});

		it("says nothing for a token with no permissions", async () => {
			const out = await run(withTokens([token(undefined), token({ layers: ["ci"] })]));
			expect(out.filter((row) => row.label === "holocron-plugin-acme")).toEqual([]);
		});

		it("fails naming the token, layer and permission that differ", async () => {
			const changed = token({
				permissions: { local: { read: "absent", write: "required" }, ci: { read: "absent" } },
			});
			expect(fails(await run(withTokens([changed])))).toEqual([
				{
					status: "fail",
					label: "HOLOCRON_ACME_TOKEN local read",
					detail: "declared absent, tokens.mdx says required",
				},
			]);
		});

		it("fails for a declared permission the table lacks", async () => {
			const more = token({ permissions: { local: { read: "required", write: "required", admin: "required" } } });
			expect(fails(await run(withTokens([more])))).toContainEqual({
				status: "fail",
				label: "HOLOCRON_ACME_TOKEN local admin",
				detail: "not in the tokens.mdx table",
			});
		});

		it("fails for a table row the declaration lacks, and for a layer rule it does not declare", async () => {
			const fewer = token({ permissions: { local: { read: "required" } } });
			expect(fails(await run(withTokens([fewer])))).toEqual([
				{
					status: "fail",
					label: "HOLOCRON_ACME_TOKEN ci read",
					detail: "tokens.mdx says absent, nothing declared",
				},
				{
					status: "fail",
					label: "HOLOCRON_ACME_TOKEN any write",
					detail: "in the tokens.mdx table, not declared",
				},
			]);
		});

		it("fails for a token with permissions and no table", async () => {
			expect(fails(await run(withTokens([declared], "nothing here")))).toEqual([
				{ status: "fail", label: "HOLOCRON_ACME_TOKEN any", detail: "no permission table in tokens.mdx" },
			]);
		});

		it("reports a declaration that could not be loaded without failing", async () => {
			const io = makeIo({
				declarations: async () => [{ plugin: "holocron-plugin-acme", tokens: [], error: "no dist" }],
			});
			const out = await run(io);
			expect(fails(out)).toEqual([]);
			expect(out).toContainEqual({
				status: "info",
				label: "holocron-plugin-acme",
				detail: "declaration not loaded: no dist",
			});
		});
	});
});
