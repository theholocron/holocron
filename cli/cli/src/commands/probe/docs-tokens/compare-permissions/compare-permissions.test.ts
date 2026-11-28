import { describe, expect, it } from "vitest";

import type { PluginToken } from "../../../auth/index.js";
import type { PermissionTable } from "../permission-tables/index.js";
import { comparePermissions } from "./compare-permissions.js";

const token: PluginToken = {
	envName: "HOLOCRON_ACME_TOKEN",
	keyringKey: "acme",
	expect: { permissions: { dev: { Read: "required" } } },
};

describe("comparePermissions", () => {
	it("matches ids without regard to case", () => {
		const tables = [{ heading: "Acme", rows: { read: { dev: "required" as const } } }];
		expect(comparePermissions([token], tables, "acme")).toEqual([]);
	});

	it("prefers the table whose heading names the env var", () => {
		const tables: PermissionTable[] = [
			{ heading: "Acme", rows: {} },
			{ heading: "HOLOCRON_ACME_TOKEN", rows: { read: { dev: "required" as const } } },
		];
		expect(comparePermissions([token], tables, "acme")).toEqual([]);
	});

	it("says what a layer's blank cell is against a declared rule", () => {
		const tables: PermissionTable[] = [{ heading: "Acme", rows: { read: {} } }];
		expect(comparePermissions([token], tables, "acme")).toEqual([
			{
				envName: "HOLOCRON_ACME_TOKEN",
				layer: "dev",
				permission: "Read",
				detail: "declared required, tokens.mdx says nothing",
			},
		]);
	});
});
