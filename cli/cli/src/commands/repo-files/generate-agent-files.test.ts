import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import {
	generateAgentFiles,
	ORG_BLOCK_BEGIN,
	ORG_BLOCK_END,
	orgAgentsBlock,
	withOrgBlock,
} from "./generate-agent-files.js";

let root: string;
let loaded: LoadedConfig;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "agent-files-"));
	loaded = {
		resolved: resolveConfig({ name: "x", providers: {} } as Parameters<typeof resolveConfig>[0]),
		filepath: join(root, "holocron.config.json"),
	};
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("withOrgBlock", () => {
	it("appends a fresh block when the begin marker has lost its end marker", () => {
		const out = withOrgBlock(`# repo\n\n${ORG_BLOCK_BEGIN}\n\ntruncated\n`);
		expect(out.endsWith(`${ORG_BLOCK_END}\n`)).toBe(true);
		expect(out).toContain("truncated");
	});

	it("appends the block to a file that has none", () => {
		const out = withOrgBlock("# repo\n\nown rules\n");
		expect(out.startsWith("# repo\n\nown rules\n\n")).toBe(true);
		expect(out.endsWith(`${ORG_BLOCK_END}\n`)).toBe(true);
	});

	it("replaces a stale block in place and keeps the text around it", () => {
		const stale = `# repo\n\n${ORG_BLOCK_BEGIN}\n\nold\n\n${ORG_BLOCK_END}\n\n## Mine\n`;
		const out = withOrgBlock(stale);
		expect(out).not.toContain("\nold\n");
		expect(out.startsWith("# repo\n\n")).toBe(true);
		expect(out.endsWith("\n## Mine\n")).toBe(true);
		expect(withOrgBlock(out)).toBe(out);
	});

	it("leaves a file that imports @.agents/org.md alone", () => {
		const text = "# holocron\n\n@.agents/org.md\n";
		expect(withOrgBlock(text)).toBe(text);
	});
});

describe("generateAgentFiles", () => {
	it("skips a repo with no AGENTS.md or CLAUDE.md", async () => {
		expect(await generateAgentFiles({ loaded, repoRoot: root })).toMatchObject([
			{ kind: "skip", message: "no AGENTS.md or CLAUDE.md" },
		]);
	});

	it("generates AGENTS.md with the block, and the second run is identical", async () => {
		writeFileSync(join(root, "AGENTS.md"), "# repo\n");
		const [entry] = await generateAgentFiles({ loaded, repoRoot: root });
		expect(entry).toMatchObject({ kind: "file", path: "AGENTS.md" });
		const content = (entry as { content: string }).content;
		expect(content).toContain(orgAgentsBlock());
		writeFileSync(join(root, "AGENTS.md"), content);
		expect((await generateAgentFiles({ loaded, repoRoot: root }))[0]).toMatchObject({ content });
	});

	it("uses AGENTS.md when CLAUDE.md is a symlink to it, and CLAUDE.md when it is the only file", async () => {
		writeFileSync(join(root, "AGENTS.md"), "# repo\n");
		symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));
		expect((await generateAgentFiles({ loaded, repoRoot: root }))[0]).toMatchObject({ path: "AGENTS.md" });
		rmSync(join(root, "CLAUDE.md"));
		rmSync(join(root, "AGENTS.md"));
		writeFileSync(join(root, "CLAUDE.md"), "# repo\n");
		expect((await generateAgentFiles({ loaded, repoRoot: root }))[0]).toMatchObject({ path: "CLAUDE.md" });
	});

	it("skips a file that imports @.agents/org.md", async () => {
		writeFileSync(join(root, "AGENTS.md"), "@.agents/org.md\n");
		expect((await generateAgentFiles({ loaded, repoRoot: root }))[0]).toMatchObject({
			kind: "skip",
			message: "imports .agents/org.md",
		});
	});
});

describe("the canonical org instructions", () => {
	it(".agents/org.md in the repo is the file the generator embeds", () => {
		const canonical = readFileSync(resolve(__dirname, "../../../../../.agents/org.md"), "utf8");
		expect(orgAgentsBlock()).toContain(canonical.trim());
	});
});
