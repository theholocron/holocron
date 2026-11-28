import { describe, expect, it } from "vitest";

import { gitAssignee } from "./git-assignee.js";

const config = (values: Record<string, string>) => (key: string) => values[key];

describe("gitAssignee", () => {
	it("prefers github.user", () => {
		expect(gitAssignee(config({ "github.user": " octo ", "user.email": "a@users.noreply.github.com" }))).toBe(
			"octo"
		);
	});

	it("reads the login from a noreply email, with or without the id", () => {
		expect(gitAssignee(config({ "user.email": "12345+octo-cat@users.noreply.github.com" }))).toBe("octo-cat");
		expect(gitAssignee(config({ "user.email": "octo@users.noreply.github.com" }))).toBe("octo");
	});

	it("gives nothing for an ordinary email or a name", () => {
		expect(gitAssignee(config({ "user.email": "me@example.com", "user.name": "Me" }))).toBeUndefined();
		expect(gitAssignee(config({}))).toBeUndefined();
	});
});
