import { describe, expect, it } from "vitest";

import { heartbeatSecretName } from "./heartbeat-secret-name.js";

describe("heartbeatSecretName", () => {
	it("upper-snake-cases the name under HOLOCRON_HEARTBEAT_", () => {
		expect(heartbeatSecretName("check-tokens")).toBe("HOLOCRON_HEARTBEAT_CHECK_TOKENS");
		expect(heartbeatSecretName("Sync specs (hourly)")).toBe("HOLOCRON_HEARTBEAT_SYNC_SPECS_HOURLY");
		expect(heartbeatSecretName("reconcileProjects")).toBe("HOLOCRON_HEARTBEAT_RECONCILE_PROJECTS");
	});

	it("is undefined for a name with nothing a variable can carry", () => {
		expect(heartbeatSecretName("---")).toBeUndefined();
		expect(heartbeatSecretName("")).toBeUndefined();
	});
});
