import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installedPeers } from "./installed-peers.js";

let root: string;

beforeEach(() => void (root = mkdtempSync(join(tmpdir(), "installed-peers-"))));
afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(path: string, json: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(json));
}

/**
 * A pnpm layout: `app/node_modules/<dep>` links into `.pnpm/<dep>/node_modules/<dep>`, and the dependency's peers sit
 * beside it in that `.pnpm` folder, not in the app's own `node_modules`.
 */
function installPnpm(dep: string, manifest: object, siblings: Record<string, string>): string {
	const app = join(root, "app");
	const store = join(root, "node_modules", ".pnpm", `${dep.replace("/", "+")}@1.0.0`, "node_modules");
	write(join(store, dep, "package.json"), { name: dep, version: "1.0.0", ...manifest });
	for (const [name, version] of Object.entries(siblings)) write(join(store, name, "package.json"), { name, version });
	mkdirSync(dirname(join(app, "node_modules", dep)), { recursive: true });
	symlinkSync(join(store, dep), join(app, "node_modules", dep));
	return app;
}

describe("installedPeers", () => {
	it("returns each required peer with the version installed beside the dependency", () => {
		const app = installPnpm(
			"@scope/plugin",
			{ peerDependencies: { "peer-a": "^1.0.0", "@scope/peer-b": ">=2" } },
			{ "peer-a": "1.4.0", "@scope/peer-b": "2.1.0" }
		);
		expect(installedPeers(app, "@scope/plugin")).toEqual({ "peer-a": "1.4.0", "@scope/peer-b": "2.1.0" });
	});

	it("leaves out an optional peer and a peer that is not installed", () => {
		const app = installPnpm(
			"plugin",
			{
				peerDependencies: { optional: "*", absent: "*", present: "*" },
				peerDependenciesMeta: { optional: { optional: true } },
			},
			{ optional: "1.0.0", present: "3.0.0" }
		);
		expect(installedPeers(app, "plugin")).toEqual({ present: "3.0.0" });
	});

	it("finds a peer in a node_modules above the dependency when it is not a sibling", () => {
		const app = join(root, "app");
		write(join(app, "node_modules", "plugin", "package.json"), {
			name: "plugin",
			version: "1.0.0",
			peerDependencies: { hoisted: "*" },
		});
		write(join(app, "node_modules", "hoisted", "package.json"), { name: "hoisted", version: "9.9.9" });
		expect(installedPeers(app, "plugin")).toEqual({ hoisted: "9.9.9" });
	});

	it("follows the peers of a peer, and stops at a cycle", () => {
		const app = installPnpm("plugin", { peerDependencies: { "peer-a": "*" } }, {});
		const store = join(root, "node_modules", ".pnpm", "plugin@1.0.0", "node_modules");
		write(join(store, "peer-a", "package.json"), {
			name: "peer-a",
			version: "1.0.0",
			peerDependencies: { "peer-b": "*", plugin: "*" },
		});
		write(join(store, "peer-b", "package.json"), { name: "peer-b", version: "2.0.0" });
		expect(installedPeers(app, "plugin")).toEqual({ "peer-a": "1.0.0", "peer-b": "2.0.0", plugin: "1.0.0" });
	});

	it("returns nothing for a dependency that declares no peers, or is not installed", () => {
		const app = installPnpm("plain", {}, {});
		expect(installedPeers(app, "plain")).toEqual({});
		expect(installedPeers(app, "never-installed")).toEqual({});
	});
});
