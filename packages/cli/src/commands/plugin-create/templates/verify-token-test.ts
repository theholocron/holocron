import type { TemplateInputs } from "../template-inputs.js";

export function render(_inputs: TemplateInputs): string {
	return `import { describe, expect, it } from "vitest";

import { verifyToken } from "../verify-token.js";
import { stubFetch } from "./helpers.js";

describe("verifyToken", () => {
	it("returns ok with a subject when /me returns 200", async () => {
		const stub = stubFetch([{ status: 200, body: { email: "user@example.com" } }]);
		const result = await verifyToken("token", { fetch: stub.fetch });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.subject).toMatch(/user@example.com/);
		}
	});

	it("returns ok:false with the error message on 401", async () => {
		const stub = stubFetch([{ status: 401, body: { messages: ["Invalid token"] } }]);
		const result = await verifyToken("bad", { fetch: stub.fetch });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toMatch(/→ 401/);
		}
	});

	it("returns ok:false when the network layer throws", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("network down");
		};
		const result = await verifyToken("t", { fetch: throwing });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toMatch(/network down/);
		}
	});
});
`;
}
