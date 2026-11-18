import { describe, expect, it } from "vitest";

import { repairSigningBody } from "./repair-signing-body.js";

const BROKEN = "const body = bru.interpolate(req.getBody().raw);";

describe("repairSigningBody", () => {
	it("rewrites the body line of a script, wherever it sits in the collection", () => {
		const collection = {
			root: { request: { script: { req: BROKEN } } },
			items: [
				{
					items: [
						{ root: { request: { script: { req: `// signs\n${BROKEN}\nreq.setHeader("x", body);` } } } },
					],
				},
			],
		};
		repairSigningBody(collection);
		const text = JSON.stringify(collection);
		expect(text).not.toContain("getBody().raw");
		expect(text.match(/JSON\.stringify\(req\.getBody\(\)\)/g)).toHaveLength(2);
		expect(collection.root.request.script.req).toContain('typeof req.getBody() === "string"');
	});

	it("rewrites a line that occurs twice in one script", () => {
		const holder = { script: `${BROKEN}\n${BROKEN}` };
		repairSigningBody(holder);
		expect(holder.script).not.toContain("getBody().raw");
		expect(holder.script.match(/JSON\.stringify/g)).toHaveLength(2);
	});

	it("leaves a script without the line, other values and non-objects alone", () => {
		const collection = {
			name: "x",
			count: 3,
			flag: true,
			nothing: null,
			list: ["a", 1],
			script: "bru.setVar('a', 1)",
		};
		const before = JSON.stringify(collection);
		repairSigningBody(collection);
		expect(JSON.stringify(collection)).toBe(before);
		expect(() => repairSigningBody(undefined)).not.toThrow();
		expect(() => repairSigningBody("text")).not.toThrow();
	});

	it("signs the text Bruno sends: the parsed object stringified, or the text it could not parse, with its variables filled in", () => {
		const VARIABLES: Record<string, string> = { pullNumber: "7", repo: "acme/demo" };
		// Bruno fills variables in after the script reads the body, so the script has to do the same before it signs.
		const interpolate = (text: string) =>
			text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => VARIABLES[name] ?? "");
		const script = (getBody: () => unknown) => {
			const holder = { script: BROKEN };
			repairSigningBody(holder);
			const code = holder.script.replace("const body = ", "return ").replace(/;$/, "");
			return new Function("bru", "req", code)({ interpolate }, { getBody });
		};
		// A body with nothing to fill in is the parsed object, stringified.
		expect(script(() => ({ zen: "x", hook_id: 1 }))).toBe('{"zen":"x","hook_id":1}');
		// A placeholder inside a string value is filled in: dropping the `bru.interpolate()` call would leave `{{repo}}`.
		expect(script(() => ({ repository: "{{repo}}" }))).toBe('{"repository":"acme/demo"}');
		// An unquoted placeholder cannot be parsed before it is filled in, so Bruno hands over the text.
		expect(script(() => '{"n":{{pullNumber}}}')).toBe('{"n":7}');
	});
});
