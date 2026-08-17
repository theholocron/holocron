import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const EXCLUDED = new Set(["docs", "node_modules", "packages", "test"]);

const root = fileURLToPath(new URL("..", import.meta.url));
const skills = readdirSync(root, { withFileTypes: true })
	.filter((d) => d.isDirectory() && !d.name.startsWith(".") && !EXCLUDED.has(d.name))
	.map((d) => d.name);

for (const skill of skills) {
	test(`${skill}/SKILL.md exists`, () => {
		const skillPath = join(root, skill, "SKILL.md");
		assert.ok(existsSync(skillPath), `Missing SKILL.md for skill: ${skill}`);
	});
}
