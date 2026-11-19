import { describe, expect, it } from "vitest";

import { WORKFLOWS } from "./index.js";

const source = WORKFLOWS["scan:secrets"] ?? "";

/** The text of one job, up to the next job or the end of the file. */
function job(name: string): string {
	const m = new RegExp(`\\n {2}${name}:\\n([\\s\\S]*?)(?=\\n {2}[\\w-]+:\\n|$)`).exec(source);
	if (!m) throw new Error(`scan:secrets has no "${name}" job`);
	// Leave out comment lines: the comment above a job sits at the end of the one before it.
	return m[1]!
		.split("\n")
		.filter((l) => !/^\s*#/.test(l))
		.join("\n");
}

describe("scan:secrets workflow", () => {
	it("keeps gitleaks as the required check, so it may fail the run", () => {
		expect(job("secret-detection")).not.toContain("continue-on-error");
	});

	it("runs betterleaks as an advisory job (#1573): every step that can fail is allowed to", () => {
		const text = job("betterleaks");
		expect(text).not.toMatch(/^ {4}continue-on-error/m);
		for (const step of ["Install betterleaks", "Run betterleaks"]) {
			const m = new RegExp(`- name: ${step}\\n([\\s\\S]*?)(?=\\n {6}- |$)`).exec(text);
			expect(m?.[1] ?? `no step named ${step}`).toContain("continue-on-error: true");
		}
	});

	it("runs betterleaks only where the repo has a betterleaks.toml", () => {
		expect(job("betterleaks")).toContain("hashFiles('betterleaks.toml') != ''");
	});

	it("installs one pinned release and checks its SHA-256", () => {
		const text = job("betterleaks");
		expect(text).toMatch(/BETTERLEAKS_VERSION: \d+\.\d+\.\d+(-rc\.\d+)?\n/);
		expect(text).toMatch(/BETTERLEAKS_SHA256: [0-9a-f]{64}\n/);
		expect(text).toContain("sha256sum --check --strict");
		expect(text).not.toMatch(/releases\/latest|@latest/);
	});
});
