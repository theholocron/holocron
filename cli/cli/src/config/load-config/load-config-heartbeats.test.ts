import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { heartbeatSecretName } from "../../commands/heartbeat-secret-name/index.js";
import { loadConfig } from "../config-system.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const gitExec = async () => "https://github.com/theholocron/holocron.git";

/** The heartbeats this repo declares (#2359) must agree with the secrets that carry their URLs and the workflows that read them. */
describe("this repo's heartbeats (#2359)", () => {
	it("each declared heartbeat has a repo-scoped `ci` secret to sync and a workflow that reads it", async () => {
		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
		const monitoring = resolved.providers.monitoring as unknown as {
			tuple: { options: { heartbeats?: { name: string }[] } };
		};
		const heartbeats = monitoring.tuple.options.heartbeats ?? [];
		expect(heartbeats.map((h) => h.name).sort()).toEqual([
			"check-tokens",
			"doctor-tokens",
			"reconcile-projects",
			"sync-specs",
		]);

		// `loadConfig()` has turned the `ci` layer into its Environment by now.
		const entries = (resolved.repo?.secrets?.sync ?? []).filter(
			(e) => (e.scope ?? "repo") === "repo" && e.environment === "theholocron/holocron - ci"
		);
		const synced = entries.flatMap((e) => e.keys);
		for (const { name } of heartbeats) {
			const secret = heartbeatSecretName(name)!;
			expect(synced, `${secret} is in repo.secrets.sync`).toContain(secret);
			const workflow = await readFile(`${REPO_ROOT}ci/workflows/${name}.yml`, "utf8");
			expect(workflow, `${name}.yml reads ${secret}`).toContain(`secrets.${secret}`);
		}
	});
});
