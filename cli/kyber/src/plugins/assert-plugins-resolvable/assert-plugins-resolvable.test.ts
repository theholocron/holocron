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

	it("counts a failure that names the plugin package as the missing one", () => {
		const named: PluginLoadFailure = {
			key: "source",
			provider: "x",
			packageName: "@acme/plugin-a",
			error: new LoaderError(
				"failed to import `@acme/plugin-a` for capability `source`: Cannot find package '@acme/plugin-a'"
			),
		};
		const subpath: PluginLoadFailure = {
			...named,
			error: new LoaderError(
				"failed to import `@acme/plugin-a` for capability `source`: Cannot find module '@acme/plugin-a/dist/x.js'"
			),
		};
		expect(() => assertPluginsResolvable(report([], [named, subpath]), "sync", make)).toThrow(
			"sync: @acme/plugin-a"
		);
	});

	it("leaves a plugin whose own dependency is missing alone, so the real cause is reported", () => {
		const dependency: PluginLoadFailure = {
			key: "tooling",
			provider: "bruno",
			packageName: "@acme/plugin-bruno",
			error: new LoaderError(
				"failed to import `@acme/plugin-bruno` for capability `tooling`: Cannot find module 'tslib'"
			),
		};
		expect(() => assertPluginsResolvable(report([], [dependency]), "export requests", make)).not.toThrow();
		expect(() => assertPluginsResolvable(report([], [importFailure("a"), dependency]), "sync", make)).not.toThrow();
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
