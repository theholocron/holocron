import { describe, expect, it } from "vitest";

import type { TasksConfig } from "../../../config/schema/index.js";
import { TREE } from "../test-fixtures.js";
import { workspacePackages } from "../workspace-packages/index.js";
import { deployTargets } from "./deploy-targets.js";

describe("deployTargets", () => {
	const all = workspacePackages("/repo", TREE);
	const manifest = (tasks: TasksConfig["tasks"]) => new Map([["/repo/packages/app", { tasks }]]);

	it("picks only delivery.deploy tasks with on: release, resolving their options", () => {
		const targets = deployTargets(
			all,
			manifest([
				"verification.unitTests",
				{ name: "delivery.deploy", with: { on: "push" } },
				{
					name: "delivery.deploy",
					with: { on: "release", channel: "beta", paths: ["docs/"] },
				},
			])
		);
		expect(targets).toEqual([
			{
				pkg: expect.objectContaining({ name: "@theholocron/app" }),
				channel: "beta",
				paths: ["docs/"],
			},
		]);
	});

	it("defaults the channel to main (stable), with no explicit paths or requirements", () => {
		const [target] = deployTargets(all, manifest([{ name: "delivery.deploy", with: { on: "release" } }]));
		expect(target).toMatchObject({ channel: "main", paths: undefined });
	});

	it("ignores a bare delivery.deploy and packages with no manifest", () => {
		expect(deployTargets(all, manifest(["delivery.deploy"]))).toEqual([]);
		expect(deployTargets(all, new Map())).toEqual([]);
	});
});
