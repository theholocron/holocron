import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../skills", import.meta.url));
const skills = readdirSync(root, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

for (const skill of skills) {
	test(`skills/${skill}/SKILL.md exists`, () => {
		const skillPath = join(root, skill, "SKILL.md");
		assert.ok(existsSync(skillPath), `Missing SKILL.md for skill: ${skill}`);
	});
}
