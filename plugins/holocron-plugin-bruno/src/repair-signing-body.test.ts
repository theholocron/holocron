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

	it("signs the text Bruno sends: the parsed object stringified, or the text it could not parse", () => {
		const script = (getBody: () => unknown) => {
			const expression = (JSON.parse(JSON.stringify({ s: BROKEN })) as { s: string }).s;
			const holder = { script: expression };
			repairSigningBody(holder);
			const code = holder.script.replace("const body = ", "return ").replace(/;$/, "");
			return new Function("bru", "req", code)({ interpolate: (text: string) => text }, { getBody });
		};
		expect(script(() => ({ zen: "x", hook_id: 1 }))).toBe('{"zen":"x","hook_id":1}');
		expect(script(() => '{"n":{{pullNumber}}}')).toBe('{"n":{{pullNumber}}}');
	});
});
