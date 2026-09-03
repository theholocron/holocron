import { describe, expect, it } from "vitest";

import { createHeader } from "./create-header.js";

const SOURCE = "packages/cli/src/some-template.ts";

describe("createHeader", () => {
	describe("workflowHeader", () => {
		it("produces yaml # lines by default", () => {
			const { workflowHeader } = createHeader({ source: SOURCE });
			const result = workflowHeader();
			expect(result).toContain("# AUTO-GENERATED — do not edit directly.");
			expect(result).toContain(`# Source:  theholocron/holocron · ${SOURCE}`);
			expect(result).toContain("# Tool:    holocron setup");
			expect(result).toMatch(/\n$/);
		});

		it("produces a cjs block comment", () => {
			const { workflowHeader } = createHeader({ source: SOURCE });
			const result = workflowHeader("cjs");
			expect(result).toMatch(/^\/\* AUTO-GENERATED/);
			expect(result).toContain(` * Source:  theholocron/holocron · ${SOURCE}`);
			expect(result).toContain(" */");
		});

		it("produces a shebang header for shell scripts", () => {
			const { workflowHeader } = createHeader({ source: SOURCE });
			const result = workflowHeader("shebang");
			expect(result).toMatch(/^#!\/bin\/sh/);
			expect(result).toContain("# AUTO-GENERATED — do not edit directly.");
		});

		it("uses forPrimary message when writing to theholocron/.github", () => {
			const { workflowHeader } = createHeader({ source: SOURCE, forPrimary: true });
			expect(workflowHeader()).toContain("do not edit in theholocron/.github directly.");
		});

		it("uses a custom tool name", () => {
			const { workflowHeader } = createHeader({ source: SOURCE, tool: "holocron sync-github" });
			expect(workflowHeader()).toContain("# Tool:    holocron sync-github");
		});
	});

	describe("scaffoldHeader", () => {
		it("produces an editable file header", () => {
			const { scaffoldHeader } = createHeader({ source: SOURCE });
			const result = scaffoldHeader();
			expect(result).toContain("# Scaffolded by holocron setup — edit this file freely.");
			expect(result).toContain(`# Source:  theholocron/holocron · ${SOURCE}`);
			expect(result).toMatch(/\n$/);
		});
	});
});
