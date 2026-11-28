import { ConfigError } from "@theholocron/kyber/config";
import { describe, expect, it, vi } from "vitest";

import { resolveEnvironmentId } from "./resolve-environment-id.js";

const gitExec = async () => "git@github.com:theholocron/holocron.git\n";

describe("resolveEnvironmentId", () => {
	it.each(["local", "dev", "ci", "prod"])(
		"turns the layer word %s into the repository's Environment",
		async (word) => {
			expect(await resolveEnvironmentId(word, { repoRoot: "/r", gitExec })).toBe(
				`theholocron/holocron - ${word}`
			);
		}
	);

	it("leaves a literal Environment name as it is, without reading the remote", async () => {
		const exec = vi.fn(gitExec);
		expect(await resolveEnvironmentId("Sentinel", { repoRoot: "/r", gitExec: exec })).toBe("Sentinel");
		expect(await resolveEnvironmentId("Prod", { repoRoot: "/r", gitExec: exec })).toBe("Prod");
		expect(exec).not.toHaveBeenCalled();
	});

	it("is a ConfigError naming the environment option when a layer word has no remote to come from", async () => {
		const err = await resolveEnvironmentId("prod", { repoRoot: "/r", gitExec: async () => "" }).catch(
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/`environment` option/);
	});
});
