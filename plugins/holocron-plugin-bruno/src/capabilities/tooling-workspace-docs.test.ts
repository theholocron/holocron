import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readDocs, withDocs } from "../workspace-docs.js";
import { BrunoTooling } from "./tooling.js";

const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

let root: string;
const read = (path: string) => readFileSync(join(root, path), "utf8");
const write = (path: string, text: string) => {
	mkdirSync(join(root, path, ".."), { recursive: true });
	writeFileSync(join(root, path), text);
};
const README = ".bruno/README.md";
const YML = ".bruno/workspace.yml";

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bruno-docs-"));
	write(
		"apps/a/api/webhook.collection.json",
		JSON.stringify({
			info: { name: "App A", schema: SCHEMA },
			item: [{ name: "ping", request: { method: "GET", url: "http://x" } }],
		})
	);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const run = (over: Record<string, unknown> = {}) =>
	new BrunoTooling({ repoRoot: root, workspaceName: "W" }).workspace({
		collectionFiles: ["apps/a/api/webhook.collection.json"],
		envFiles: [],
		repoRoot: root,
		...over,
	});
const states = (files: { path: string; state: string }[]) => Object.fromEntries(files.map((f) => [f.path, f.state]));
const baseline = () => JSON.parse(read(".bruno/.sync.json")) as { pairs: { kind: string }[] };

describe("the docs pair: .bruno/README.md and the `docs` of workspace.yml", () => {
	it("does nothing while neither side exists", async () => {
		const result = await run();
		expect(states(result.files)[README]).toBeUndefined();
		expect(existsSync(join(root, README))).toBe(false);
		expect(baseline().pairs.some((p) => p.kind === "docs")).toBe(false);
	});

	it("makes the workspace docs from a README that has no workspace file yet", async () => {
		write(README, "# Hello\n\nWorld\n");
		const result = await run();
		expect(states(result.files)).toMatchObject({ [README]: "unchanged", [YML]: "new" });
		expect(readDocs(read(YML))).toBe("# Hello\n\nWorld");
		expect(read(YML)).toContain("docs: |-");
		expect(baseline().pairs.some((p) => p.kind === "docs")).toBe(true);
	});

	it("makes the README from the workspace docs when the README is missing", async () => {
		await run();
		write(YML, withDocs(read(YML), "# From Bruno\n\nText"));
		const result = await run();
		expect(states(result.files)[README]).toBe("new");
		expect(read(README)).toBe("# From Bruno\n\nText\n");
	});

	it("leaves both alone when neither changed, even if the README has another trailing newline or line ending", async () => {
		write(README, "# Hello\n");
		await run();
		const before = read(YML);
		write(README, "# Hello\r\n\r\n");
		const result = await run();
		expect(states(result.files)).toMatchObject({ [README]: "unchanged", [YML]: "unchanged" });
		expect(read(YML)).toBe(before);
		expect(read(README)).toBe("# Hello\r\n\r\n");
	});

	it("writes a changed README into the workspace file and keeps the rest of it byte for byte", async () => {
		write(README, "# One\n");
		await run();
		write(YML, `${read(YML)}activeEnvironmentUid: abc\n`);
		const before = read(YML);
		write(README, "# Two\n\nmore\n");
		const result = await run();
		expect(states(result.files)).toMatchObject({ [README]: "unchanged", [YML]: "changed" });
		expect(read(YML)).toBe(withDocs(before, "# Two\n\nmore"));
		expect(read(YML)).toContain("activeEnvironmentUid: abc");
	});

	it("writes changed workspace docs into the README, and does not touch the workspace file", async () => {
		write(README, "# One\n");
		await run();
		const changed = withDocs(read(YML), "# Edited in Bruno");
		write(YML, changed);
		const result = await run();
		expect(states(result.files)).toMatchObject({ [README]: "changed", [YML]: "unchanged" });
		expect(read(README)).toBe("# Edited in Bruno\n");
		expect(read(YML)).toBe(changed);
	});

	it("is a no-op the second time", async () => {
		write(README, "# One\n");
		await run();
		const again = await run();
		expect(new Set(again.files.map((f) => f.state))).toEqual(new Set(["unchanged"]));
	});

	it("fills in a workspace file that has `docs: ''` or no `docs:` key", async () => {
		write(README, "# One\n");
		await run();
		write(YML, read(YML).replace(/docs: \|-\n {2}# One\n/, "docs: ''\n"));
		await run();
		expect(readDocs(read(YML))).toBe("# One");
		write(YML, read(YML).replace(/\n*docs: \|-\n {2}# One\n/, "\n"));
		expect(readDocs(read(YML))).toBeUndefined();
		await run();
		expect(readDocs(read(YML))).toBe("# One");
	});

	describe("both changed", () => {
		const diverge = async () => {
			write(README, "# One\n");
			await run();
			write(README, "# README edit\n");
			write(YML, withDocs(read(YML), "# Bruno edit"));
		};

		it("is a conflict that writes nothing", async () => {
			await diverge();
			const yml = read(YML);
			const result = await run();
			expect(result.files.find((f) => f.path === README)).toMatchObject({ state: "conflict" });
			expect(read(YML)).toBe(yml);
			expect(read(README)).toBe("# README edit\n");
		});

		it("is settled by `prefer: source`, the README", async () => {
			await diverge();
			await run({ prefer: "source" });
			expect(readDocs(read(YML))).toBe("# README edit");
			expect(read(README)).toBe("# README edit\n");
		});

		it("is settled by `prefer: workspace`, Bruno's docs", async () => {
			await diverge();
			await run({ prefer: "workspace" });
			expect(read(README)).toBe("# Bruno edit\n");
		});

		it("is not a conflict when both changed to the same text", async () => {
			write(README, "# One\n");
			await run();
			write(README, "# Same\n");
			write(YML, withDocs(read(YML), "# Same"));
			const result = await run();
			expect(result.files.some((f) => f.state === "conflict")).toBe(false);
		});
	});

	it("a dry run reports the change and writes nothing", async () => {
		write(README, "# One\n");
		await run();
		write(README, "# Two\n");
		const yml = read(YML);
		const result = await run({ dryRun: true });
		expect(states(result.files)[YML]).toBe("changed");
		expect(read(YML)).toBe(yml);
	});

	it("keeps the docs of the workspace file when a collection is added at the same time", async () => {
		write(README, "# One\n");
		await run();
		write(
			"apps/b/api/webhook.collection.json",
			JSON.stringify({
				info: { name: "App B", schema: SCHEMA },
				item: [{ name: "x", request: { method: "GET", url: "http://x" } }],
			})
		);
		await run({ collectionFiles: ["apps/a/api/webhook.collection.json", "apps/b/api/webhook.collection.json"] });
		expect(read(YML)).toContain("collections/app-b");
		expect(readDocs(read(YML))).toBe("# One");
	});
});
