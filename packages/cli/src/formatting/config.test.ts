import { describe, expect, it } from "vitest";

import { ALEX_IGNORE_PATTERNS } from "../inclusive-language/config.js";
import { PRETTIER_IGNORE_PATTERNS } from "./config.js";

describe("PRETTIER_IGNORE_PATTERNS", () => {
	it("includes every ALEX_IGNORE_PATTERNS entry", () => {
		for (const pattern of ALEX_IGNORE_PATTERNS) {
			expect(PRETTIER_IGNORE_PATTERNS).toContain(pattern);
		}
	});

	it("adds pnpm-lock.yaml, prettier-specific (alex never reads a lockfile)", () => {
		expect(PRETTIER_IGNORE_PATTERNS).toContain("pnpm-lock.yaml");
	});
});
