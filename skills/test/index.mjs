import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const srcDir = join(root, "src");
const skills = readdirSync(srcDir, { withFileTypes: true })
	.filter((d) => d.isDirectory() && !d.name.startsWith("."))
	.map((d) => d.name);

for (const skill of skills) {
	test(`${skill}/SKILL.md exists`, () => {
		const skillPath = join(srcDir, skill, "SKILL.md");
		assert.ok(existsSync(skillPath), `Missing SKILL.md for skill: ${skill}`);
	});
}
