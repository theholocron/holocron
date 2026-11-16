import { ProviderApiError } from "@theholocron/cli";
import type { GitHubClient, GitHubIssueFieldValue } from "@theholocron/github-client";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { type FakeIssueFields, PRIORITY_FIELD, withIssueFields } from "./issue-fields.testing.js";
import { createPrioritySetter } from "./issue-priority.js";

const REPO = "theholocron/holocron";
const unused: typeof fetch = async () => {
	throw new Error("only issue-field calls are expected");
};

function setter(fields: FakeIssueFields = { fields: [PRIORITY_FIELD] }) {
	const { fetch, calls } = withIssueFields(unused, fields);
	return { priority: createPrioritySetter(createGitHubClient({ token: "pat", fetch }), REPO), calls };
}

const value = (name: string, over: Partial<GitHubIssueFieldValue> = {}): GitHubIssueFieldValue => ({
	issue_field_id: PRIORITY_FIELD.id,
	data_type: "single_select",
	value: name,
	single_select_option: { id: 9, name, color: "red" },
	...over,
});

const failure = (status: number, body: string) => new Response(body, { status });

describe("createPrioritySetter", () => {
	it("does nothing, and asks nothing, for a record with no priority, and never clears a value", async () => {
		const { priority, calls } = setter();
		await expect(priority.set(7, undefined)).resolves.toEqual({ changed: false });
		await expect(priority.set(7, "none")).resolves.toEqual({ changed: false });
		expect(calls).toEqual([]);
	});

	it("sets a new issue's field by the field id and the option's name, without reading its values", async () => {
		const { priority, calls } = setter();
		await expect(priority.set(7, "urgent", { isNew: true })).resolves.toEqual({ changed: true });
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			"GET /orgs/theholocron/issue-fields",
			"POST /repos/theholocron/holocron/issues/7/issue-field-values",
		]);
		expect(calls[1]?.body).toEqual({ issue_field_values: [{ field_id: PRIORITY_FIELD.id, value: "Urgent" }] });
	});

	it("reads the field list once for the whole run", async () => {
		const { priority, calls } = setter();
		await priority.set(7, "high", { isNew: true });
		await priority.set(8, "low", { isNew: true });
		expect(calls.filter((c) => c.path.endsWith("/issue-fields"))).toHaveLength(1);
	});

	it("adds the value to an issue that has none, and leaves its other values alone", async () => {
		const other = value("5", { issue_field_id: 1, data_type: "number", single_select_option: null });
		const { priority, calls } = setter({ fields: [PRIORITY_FIELD], values: { 7: [other] } });
		await expect(priority.set(7, "medium")).resolves.toEqual({ changed: true });
		expect(calls.map((c) => c.method)).toEqual(["GET", "GET", "POST"]);
	});

	it("does not write when the issue already has the level, whatever the case of its name", async () => {
		const { priority, calls } = setter({ fields: [PRIORITY_FIELD], values: { 7: [value("URGENT")] } });
		await expect(priority.set(7, "urgent")).resolves.toEqual({ changed: false });
		expect(calls.map((c) => c.method)).toEqual(["GET", "GET"]);
	});

	it("reads the option from `value` when GitHub gives no option object", async () => {
		const { priority } = setter({
			fields: [PRIORITY_FIELD],
			values: { 7: [value("High", { single_select_option: null })] },
		});
		await expect(priority.set(7, "high")).resolves.toEqual({ changed: false });
	});

	it("removes a different value before it adds the new one", async () => {
		const { priority, calls } = setter({ fields: [PRIORITY_FIELD], values: { 7: [value("Low")] } });
		await expect(priority.set(7, "urgent")).resolves.toEqual({ changed: true });
		expect(calls.slice(2).map((c) => `${c.method} ${c.path}`)).toEqual([
			`DELETE /repos/theholocron/holocron/issues/7/issue-field-values/${PRIORITY_FIELD.id}`,
			"POST /repos/theholocron/holocron/issues/7/issue-field-values",
		]);
	});

	it("reads and writes nothing on a dry run, but says it would set the field", async () => {
		const { priority, calls } = setter({ fields: [PRIORITY_FIELD], values: { 7: [value("Low")] } });
		await expect(priority.set(7, "urgent", { dryRun: true })).resolves.toEqual({ changed: true });
		expect(calls.map((c) => c.method)).toEqual(["GET", "GET"]);
	});

	it("says so when the organization has no Priority field, or it is not a single select", async () => {
		const none = setter({ fields: [] });
		await expect(none.priority.set(7, "urgent", { isNew: true })).resolves.toEqual({
			changed: false,
			note: "priority field (theholocron has no Priority issue field)",
		});
		const text = setter({ fields: [{ ...PRIORITY_FIELD, data_type: "text" }] });
		await expect(text.priority.set(7, "urgent", { isNew: true })).resolves.toMatchObject({ changed: false });
	});

	it("says so when the field has no option for the level", async () => {
		const { priority, calls } = setter({ fields: [{ ...PRIORITY_FIELD, options: [{ id: 1, name: "High" }] }] });
		await expect(priority.set(7, "urgent", { isNew: true })).resolves.toEqual({
			changed: false,
			note: 'priority field (no "Urgent" option)',
		});
		expect(calls).toHaveLength(1);
		const bare = setter({ fields: [{ ...PRIORITY_FIELD, options: undefined }] });
		await expect(bare.priority.set(7, "urgent", { isNew: true })).resolves.toMatchObject({ changed: false });
	});

	it("reports a refusal to list the fields, and a refused write, and goes on", async () => {
		const noList = setter({ fields: failure(403, '{"message":"Resource not accessible"}') });
		await expect(noList.priority.set(7, "urgent", { isNew: true })).resolves.toEqual({
			changed: false,
			note: "priority field (GitHub refused: 403)",
		});
		const noWrite = setter({ fields: [PRIORITY_FIELD], writeStatus: 422 });
		await expect(noWrite.priority.set(7, "urgent", { isNew: true })).resolves.toEqual({
			changed: false,
			note: "priority field (GitHub refused: 422)",
		});
	});

	it("does not swallow a rate limit, a server error or a failure that is not an API error", async () => {
		const limited = setter({ fields: failure(403, '{"message":"API rate limit exceeded"}') });
		await expect(limited.priority.set(7, "urgent", { isNew: true })).rejects.toBeInstanceOf(ProviderApiError);
		const server = setter({ fields: [PRIORITY_FIELD], writeStatus: 500 });
		await expect(server.priority.set(7, "urgent", { isNew: true })).rejects.toBeInstanceOf(ProviderApiError);
		const broken = createPrioritySetter(
			{
				issueFields: {
					list: async () => {
						throw new Error("offline");
					},
				},
			} as unknown as GitHubClient,
			REPO
		);
		await expect(broken.set(7, "urgent", { isNew: true })).rejects.toThrow("offline");
	});
});
