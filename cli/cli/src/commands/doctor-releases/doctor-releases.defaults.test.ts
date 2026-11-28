import { afterEach, describe, expect, it, vi } from "vitest";

const realReleasesIo = vi.hoisted(() => vi.fn());
vi.mock("./real-releases-io.js", () => ({ realReleasesIo }));

import { runDoctorReleases } from "./doctor-releases.js";

afterEach(() => vi.restoreAllMocks());

describe("runDoctorReleases defaults", () => {
	it("reads the real io for the repo and prints to the console", async () => {
		realReleasesIo.mockReturnValue({
			tags: () => [],
			packages: () => ["@x/cli"],
			distTags: async () => undefined,
			now: () => 0,
		});
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const report = await runDoctorReleases({ loaded: { resolved: {} } as never, context: { repoRoot: "/repo" } });
		expect(realReleasesIo).toHaveBeenCalledWith("/repo");
		expect(log).toHaveBeenCalled();
		expect(report.status).toBe("skip");
	});
});
