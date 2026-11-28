import { describe, expect, it } from "vitest";

import { record } from "../../migrate/migrate.testing.js";
import { applyAssignees } from "./apply-assignees.js";

const links = [{ login: "octocat", email: "Octo@acme.dev" }];
const withAssignee = (assignee: NonNullable<ReturnType<typeof record>["assignee"]>) => ({ ...record("#1"), assignee });

describe("applyAssignees", () => {
	it("gives a Linear user (by email, whatever its case) the GitHub login", () => {
		const [out] = applyAssignees(
			[withAssignee({ id: "lin-1", displayName: "Octo", emailAddress: "octo@ACME.dev" })],
			links
		);
		expect(out!.assignee).toEqual({
			id: "lin-1",
			displayName: "Octo",
			emailAddress: "octo@ACME.dev",
			login: "octocat",
		});
	});

	it("gives a GitHub user (by login) the Linear email, and the login again", () => {
		const [out] = applyAssignees([withAssignee({ id: "OctoCat", displayName: "Octo" })], links);
		expect(out!.assignee).toEqual({
			id: "OctoCat",
			displayName: "Octo",
			login: "octocat",
			emailAddress: "Octo@acme.dev",
		});
	});

	it("keeps an email the source already has", () => {
		const [out] = applyAssignees(
			[withAssignee({ id: "octocat", displayName: "Octo", emailAddress: "other@acme.dev" })],
			links
		);
		expect(out!.assignee?.emailAddress).toBe("other@acme.dev");
		expect(out!.assignee?.login).toBe("octocat");
	});

	it("leaves a record with no assignee, or an assignee the file does not name, as it was", () => {
		const nobody = record("#2");
		const stranger = withAssignee({ id: "someone", displayName: "S", emailAddress: "s@acme.dev" });
		expect(applyAssignees([nobody, stranger], links)).toEqual([nobody, stranger]);
	});

	it("returns the same records when the file names nobody", () => {
		const records = [withAssignee({ id: "octocat", displayName: "Octo" })];
		expect(applyAssignees(records, [])).toBe(records);
	});
});
