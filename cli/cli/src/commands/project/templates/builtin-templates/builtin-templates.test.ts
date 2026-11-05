import { describe, expect, it } from "vitest";

import { validateTemplateFile } from "../validate-template/index.js";
import { BUILTIN_TEMPLATES } from "./builtin-templates.js";

describe("BUILTIN_TEMPLATES", () => {
	it("is keyed by each template's own name", () => {
		for (const [key, template] of Object.entries(BUILTIN_TEMPLATES)) {
			expect(template.name).toBe(key);
		}
	});

	it("passes the same validation a repo's template file does", () => {
		for (const template of Object.values(BUILTIN_TEMPLATES)) {
			expect(validateTemplateFile(template)).toMatchObject({ ok: true });
		}
	});
});
