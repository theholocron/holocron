import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it } from "vitest";

import { runUpgradeNode } from "./upgrade-node.js";

describe("runUpgradeNode (CLI binding)", () => {
	it("delegates to astromech and logs through the injected logger", async () => {
		const logger = fakeLogger();
		const lines: string[] = [];
		const report = await runUpgradeNode({
			to: 22,
			from: 20,
			cwd: "/repo",
			dryRun: true,
			print: (l) => lines.push(l),
			logger,
			walkFiles: () => ["/repo/.nvmrc"],
			readFile: () => "20\n",
			writeFile: () => {
				throw new Error("dry-run must not write");
			},
		});
		expect(report).toEqual({ status: "dry-run", updated: [".nvmrc"] });
		expect(logger.info).toHaveBeenCalledWith(expect.anything(), "upgrade node: done");
	});
});
