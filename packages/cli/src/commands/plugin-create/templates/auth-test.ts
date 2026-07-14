import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	return `import { describe, expect, it } from "vitest";

import { AuthError, resolveToken } from "../auth.js";

const noKeyring = () => null;

describe("resolveToken", () => {
	it("prefers --token over env vars + keyring", () => {
		expect(
			resolveToken({
				cliToken: "flag",
				env: { ${inputs.tokenEnv}: "hlc", ${inputs.vendorEnv}: "vendor" },
				keyring: () => "kr",
			})
		).toBe("flag");
	});

	it("prefers ${inputs.tokenEnv} over ${inputs.vendorEnv}", () => {
		expect(
			resolveToken({
				env: { ${inputs.tokenEnv}: "hlc", ${inputs.vendorEnv}: "vendor" },
				keyring: noKeyring,
			})
		).toBe("hlc");
	});

	it("falls back to ${inputs.vendorEnv} when ${inputs.tokenEnv} is unset", () => {
		expect(resolveToken({ env: { ${inputs.vendorEnv}: "vendor" }, keyring: noKeyring })).toBe("vendor");
	});

	it("falls back to keyring when env vars are unset", () => {
		expect(resolveToken({ env: {}, keyring: (p) => (p === "${inputs.slug}" ? "kr" : null) })).toBe("kr");
	});

	it("throws AuthError with a helpful message when nothing is set", () => {
		try {
			resolveToken({ env: {}, keyring: noKeyring });
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(AuthError);
			expect((err as Error).message).toMatch(/${inputs.tokenEnv}/);
			expect((err as Error).message).toMatch(/holocron auth set ${inputs.slug}/);
		}
	});
});
`;
}
