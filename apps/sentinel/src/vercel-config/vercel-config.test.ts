import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface VercelConfig {
	installCommand?: string;
}

const config = JSON.parse(
	readFileSync(fileURLToPath(new URL("../../vercel.json", import.meta.url)), "utf8")
) as VercelConfig;

// The staged payload pins exact versions, and the plugins peer on one exact CLI version and on `^` ranges of packages that
// are prereleases here, so a strict `npm install` fails with ERESOLVE and the deployment never builds.
describe("vercel.json", () => {
	it("installs without enforcing peer ranges", () => {
		expect(config.installCommand).toBe("npm install --legacy-peer-deps");
	});
});
