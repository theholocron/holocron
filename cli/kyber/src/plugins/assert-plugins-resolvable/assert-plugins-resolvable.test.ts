import { describe, expect, it } from "vitest";

import type { PluginLoadFailure } from "../create-plugin-system/index.js";
import { LoaderError } from "../loader-error/index.js";
import { assertPluginsResolvable } from "./assert-plugins-resolvable.js";

function report(keys: string[], failures: PluginLoadFailure[]) {
	return { loadedKeys: () => keys, loadFailures: () => failures };
}

const importFailure = (packageName: string): PluginLoadFailure => ({
	key: "source",
	provider: "x",
	packageName,
	error: new LoaderError(`failed to import \`${packageName}\` for capability \`source\`: Cannot find package`),
});

const make = (command: string, packages: readonly string[]) => new Error(`${command}: ${packages.join(",")}`);

describe("assertPluginsResolvable", () => {
	it("throws the built error, with each package once, when every failure is a failed import", () => {
		const loader = report([], [importFailure("a"), importFailure("b"), importFailure("a")]);
		expect(() => assertPluginsResolvable(loader, "sync", make)).toThrow("sync: a,b");
	});

	it("does nothing when a capability loaded", () => {
		expect(() => assertPluginsResolvable(report(["source"], [importFailure("a")]), "sync", make)).not.toThrow();
	});

	it("does nothing when nothing failed", () => {
		expect(() => assertPluginsResolvable(report([], []), "sync", make)).not.toThrow();
	});

	it("leaves a failure that is not a failed import alone", () => {
		const other: PluginLoadFailure = {
			key: "source",
			provider: "x",
			packageName: "a",
			error: new Error("bad token"),
		};
		expect(() => assertPluginsResolvable(report([], [importFailure("a"), other]), "sync", make)).not.toThrow();
	});
});
