import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { createFieldSetter } from "./issue-field-setter.js";
import { createWorkFieldReader, writeWorkFields } from "./issue-work-fields.js";

const REPO = "theholocron/holocron";
const EFFORT = {
	id: 2,
	name: "Effort",
	data_type: "single_select",
	options: [
		{ id: 1, name: "High" },
		{ id: 2, name: "Low" },
	],
};
const START = { id: 3, name: "Start date", data_type: "date" };
const TARGET = { id: 4, name: "Target date", data_type: "date" };

interface Setup {
	fields?: unknown[] | number;
	values?: unknown[] | number;
}

function make(setup: Setup = {}) {
	const calls: string[] = [];
	const json = (body: unknown, status = 200) =>
		new Response(status === 204 ? null : JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});
	const fetchFn: typeof fetch = async (input, init) => {
		const url = new URL(String(input));
		const method = init?.method ?? "GET";
		calls.push(`${method} ${url.pathname.replace(`/repos/${REPO}`, "")}`);
		if (url.pathname.endsWith("/issue-fields")) {
			return typeof setup.fields === "number"
				? json({ message: "x" }, setup.fields)
				: json(setup.fields ?? [EFFORT, START, TARGET]);
		}
		if (method === "GET") {
			return typeof setup.values === "number" ? json({ message: "x" }, setup.values) : json(setup.values ?? []);
		}
		return method === "DELETE" ? json(null, 204) : json([]);
	};
	return { client: createGitHubClient({ token: "pat", fetch: fetchFn }), calls };
}

const option = (name: string) => ({
	issue_field_id: 2,
	data_type: "single_select",
	value: name,
	single_select_option: { id: 1, name, color: "red" },
});

describe("createWorkFieldReader", () => {
	it("reads Effort and both dates, the dates cut to the day", async () => {
		const { client } = make({
			values: [
				option("High"),
				{ issue_field_id: 3, data_type: "date", value: "2026-03-01T00:00:00Z" },
				{ issue_field_id: 4, data_type: "date", value: "2026-04-01" },
			],
		});
		expect(await createWorkFieldReader(client, REPO).read(7)).toEqual({
			effort: "high",
			startDate: "2026-03-01",
			targetDate: "2026-04-01",
		});
	});

	it("leaves out a field the issue has no value for and an Effort option it does not know", async () => {
		const { client } = make({ values: [option("Huge")] });
		expect(await createWorkFieldReader(client, REPO).read(7)).toEqual({});
	});

	it("reads the organization's field list once, and nothing per issue when it has none of the three", async () => {
		const some = make();
		const reader = createWorkFieldReader(some.client, REPO);
		await reader.read(1);
		await reader.read(2);
		expect(some.calls.filter((c) => c.endsWith("/issue-fields"))).toHaveLength(1);
		expect(some.calls.filter((c) => c.includes("issue-field-values"))).toHaveLength(2);

		const none = make({ fields: [{ id: 9, name: "Priority", data_type: "single_select" }] });
		expect(await createWorkFieldReader(none.client, REPO).read(1)).toEqual({});
		expect(none.calls.filter((c) => c.includes("issue-field-values"))).toHaveLength(0);
	});

	it("reads nothing, without failing, when GitHub refuses the field list or the values", async () => {
		expect(await createWorkFieldReader(make({ fields: 404 }).client, REPO).read(1)).toEqual({});
		expect(await createWorkFieldReader(make({ values: 403 }).client, REPO).read(1)).toEqual({});
	});

	it("passes any other failure through", async () => {
		await expect(createWorkFieldReader(make({ fields: 500 }).client, REPO).read(1)).rejects.toThrow();
		await expect(createWorkFieldReader(make({ values: 500 }).client, REPO).read(1)).rejects.toThrow();
	});
});

describe("writeWorkFields", () => {
	it("writes only the fields the record carries", async () => {
		const { client, calls } = make();
		const out = await writeWorkFields(
			createFieldSetter(client, REPO),
			7,
			{ effort: "low", targetDate: "2026-04-01" },
			{ isNew: true }
		);
		expect(out).toEqual({ changed: ["effort", "targetDate"], notes: [] });
		expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(2);
	});

	it("does nothing for a record with none of them", async () => {
		const { client, calls } = make();
		expect(await writeWorkFields(createFieldSetter(client, REPO), 7, {}, { isNew: true })).toEqual({
			changed: [],
			notes: [],
		});
		expect(calls).toEqual([]);
	});

	it("reports a missing option and an organization without the field, as notes", async () => {
		const { client } = make({ fields: [EFFORT] });
		const out = await writeWorkFields(
			createFieldSetter(client, REPO),
			7,
			{ effort: "medium", startDate: "2026-03-01" },
			{ isNew: true }
		);
		expect(out.changed).toEqual([]);
		expect(out.notes).toEqual([
			'effort field (no "Medium" option)',
			"start date field (theholocron has no Start date issue field)",
		]);
	});
});
