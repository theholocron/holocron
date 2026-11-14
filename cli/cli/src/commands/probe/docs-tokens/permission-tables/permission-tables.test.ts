import { describe, expect, it } from "vitest";

import { permissionTables } from "./permission-tables.js";

describe("permissionTables", () => {
	it("reads the Id and layer columns and ignores the rest", () => {
		const page = [
			"# Title",
			"## Acme tokens",
			"| Permission | Id | Resource | `local` | **dev** | `ci` | Called by |",
			"| --- | --- | --- | --- | --- | --- | --- |",
			"| Read | `read` | all | `required` | Required | `absent` | x |",
			"| Write | `Write` | all | - | | something else | x |",
			"|  | | | | | | |",
			"",
			"| Other | table |",
			"| --- | --- |",
			"| a | b |",
			"",
			"| Id | Name |",
			"| --- | --- |",
			"| `x` | no layer columns |",
		].join("\n");
		expect(permissionTables(page)).toEqual([
			{
				heading: "Acme tokens",
				rows: { read: { local: "required", dev: "required", ci: "absent" }, write: {} },
			},
		]);
	});

	it("is empty for a page with no table, and tolerates a row with fewer cells than the header", () => {
		expect(permissionTables("just text\n| not a table")).toEqual([]);
		const short = "| Id | `local` |\n| --- | --- |\n| `a` |";
		expect(permissionTables(short)).toEqual([{ heading: "", rows: { a: {} } }]);
	});

	it("skips a row too short to have an id", () => {
		const page = "| Name | Id | `local` |\n| --- | --- | --- |\n| a |\n| b | `x` | required |";
		expect(permissionTables(page)).toEqual([{ heading: "", rows: { x: { local: "required" } } }]);
	});
});
