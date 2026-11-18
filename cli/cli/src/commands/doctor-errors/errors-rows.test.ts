import { describe, expect, it } from "vitest";

import type { ErrorsInspection } from "../../plugin/index.js";
import { errorsRows } from "./errors-rows.js";

const healthy = (): ErrorsInspection => ({
	org: { slug: "acme", exists: true, name: "Acme" },
	projects: [{ slug: "holocron", exists: true, hasDsn: true, alertRules: 2 }],
});

const byId = (found: ErrorsInspection) => Object.fromEntries(errorsRows(found, "sentry").map((r) => [r.id, r]));

describe("errorsRows", () => {
	it("passes the org and each project's existence, key and alert rules", () => {
		const rows = errorsRows(healthy(), "sentry");
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["errors:org", "ok"],
			["errors:project:holocron", "ok"],
			["errors:dsn:holocron", "ok"],
			["errors:alerts:holocron", "ok"],
		]);
		expect(rows[0]!.detail).toBe("acme (Acme)");
		expect(rows[3]!.detail).toBe("2 enabled rule(s)");
	});

	it("fails a missing organization and skips the projects it would hold", () => {
		const rows = byId({ org: { slug: "acme", exists: false }, projects: [{ slug: "holocron", exists: false }] });
		expect(rows["errors:org"]).toMatchObject({ status: "fail", detail: "acme not found" });
		expect(rows["errors:project:holocron"]).toMatchObject({ status: "skip" });
	});

	it("skips, rather than fails, when no project is declared", () => {
		const rows = errorsRows({ org: { slug: "acme", exists: true }, projects: [] }, "sentry");
		expect(rows.map((r) => r.status)).toEqual(["ok", "skip"]);
		expect(rows[0]!.detail).toBe("acme (acme)");
	});

	it("fails a missing project and skips its key and rules", () => {
		const found = healthy();
		found.projects = [{ slug: "gone", exists: false }];
		const rows = byId(found);
		expect(rows["errors:project:gone"]).toMatchObject({ status: "fail" });
		expect(rows["errors:project:gone"]!.problems[0]).toMatch(/no project gone in acme/);
		expect(rows["errors:dsn:gone"]).toMatchObject({ status: "skip" });
		expect(rows["errors:alerts:gone"]).toMatchObject({ status: "skip" });
	});

	it("fails a project with no client key", () => {
		const found = healthy();
		found.projects = [{ slug: "holocron", exists: true, hasDsn: false, alertRules: 1 }];
		expect(byId(found)["errors:dsn:holocron"]).toMatchObject({ status: "fail" });
	});

	it("fails a project no enabled rule watches", () => {
		const found = healthy();
		found.projects = [{ slug: "holocron", exists: true, hasDsn: true, alertRules: 0 }];
		const row = byId(found)["errors:alerts:holocron"]!;
		expect(row.status).toBe("fail");
		expect(row.problems[0]).toMatch(/reach no one/);
	});

	it("skips the alert rules with the reason when they could not be read", () => {
		const found = healthy();
		found.projects = [{ slug: "holocron", exists: true, hasDsn: true }];
		found.alertsUnreadable = "403 forbidden";
		expect(byId(found)["errors:alerts:holocron"]).toMatchObject({
			status: "skip",
			detail: "could not read the alert rules: 403 forbidden",
		});
		delete found.alertsUnreadable;
		expect(byId(found)["errors:alerts:holocron"]!.detail).toBe("not read");
	});
});
