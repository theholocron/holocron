import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { createFieldSetter } from "./issue-field-setter.js";

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
				: json(setup.fields ?? [EFFORT, START]);
		}
		if (method === "GET") {
			return typeof setup.values === "number" ? json({ message: "x" }, setup.values) : json(setup.values ?? []);
		}
		return method === "DELETE" ? json(null, 204) : json([]);
	};
	return { setter: createFieldSetter(createGitHubClient({ token: "pat", fetch: fetchFn }), REPO), calls };
}

const effortValue = {
	issue_field_id: 2,
	data_type: "single_select",
	value: "Low",
	single_select_option: { id: 2, name: "Low", color: "x" },
};
const startValue = { issue_field_id: 3, data_type: "date", value: "2026-12-01T00:00:00Z" };
const writes = (calls: string[]) => calls.filter((c) => !c.startsWith("GET"));

describe("createFieldSetter.set", () => {
	it("sets nothing for an empty value", async () => {
		const { setter, calls } = make();
		expect(await setter.set(7, { name: "Effort", type: "select" })).toEqual({ changed: false });
		expect(calls).toEqual([]);
	});

	it("says whether it would change on a dry run, and writes nothing", async () => {
		const { setter, calls } = make({ values: [effortValue] });
		expect(await setter.set(7, { name: "Effort", type: "select", value: "high" }, { dryRun: true })).toEqual({
			changed: true,
		});
		expect(writes(calls)).toEqual([]);
	});

	it("notes an option the field lacks, and a field of the wrong type", async () => {
		const { setter } = make();
		expect((await setter.set(7, { name: "Effort", type: "select", value: "huge" })).note).toBe(
			'effort field (no "huge" option)'
		);
		expect((await setter.set(7, { name: "Effort", type: "date", value: "2026-12-01" })).note).toContain(
			"has no Effort issue field"
		);
	});

	it("notes a refusal reading the values or the fields, and throws any other failure", async () => {
		expect(
			(await make({ values: 403 }).setter.set(7, { name: "Effort", type: "select", value: "High" })).note
		).toBe("effort field (GitHub refused: 403)");
		expect(
			(await make({ fields: 403 }).setter.set(7, { name: "Effort", type: "select", value: "High" })).note
		).toBe("effort field (GitHub refused: 403)");
		await expect(
			make({ values: 500 }).setter.set(7, { name: "Effort", type: "select", value: "High" })
		).rejects.toMatchObject({ status: 500 });
		await expect(
			make({ fields: 500 }).setter.set(7, { name: "Effort", type: "select", value: "High" })
		).rejects.toMatchObject({ status: 500 });
	});

	it("compares a date by its first ten characters", async () => {
		const { setter, calls } = make({ values: [startValue] });
		expect(await setter.set(7, { name: "Start date", type: "date", value: "2026-12-01" })).toEqual({
			changed: false,
		});
		expect(writes(calls)).toEqual([]);
	});
});

describe("createFieldSetter.clear", () => {
	it("does nothing for a new issue", async () => {
		const { setter, calls } = make();
		expect(await setter.clear(7, { name: "Effort", type: "select" }, { isNew: true })).toEqual({ changed: false });
		expect(calls).toEqual([]);
	});

	it("does nothing when the issue has no value, and says it would on a dry run", async () => {
		const none = make();
		expect(await none.setter.clear(7, { name: "Effort", type: "select" })).toEqual({ changed: false });
		const dry = make({ values: [effortValue] });
		expect(await dry.setter.clear(7, { name: "Effort", type: "select" }, { dryRun: true })).toEqual({
			changed: true,
		});
		expect(writes(dry.calls)).toEqual([]);
	});

	it("removes the value", async () => {
		const { setter, calls } = make({ values: [effortValue] });
		expect(await setter.clear(7, { name: "Effort", type: "select" })).toEqual({ changed: true });
		expect(writes(calls)).toEqual(["DELETE /issues/7/issue-field-values/2"]);
	});

	it("notes a missing field and a refusal, and throws any other failure", async () => {
		expect((await make({ fields: [] }).setter.clear(7, { name: "Effort", type: "select" })).note).toContain(
			"has no Effort issue field"
		);
		expect((await make({ values: 403 }).setter.clear(7, { name: "Effort", type: "select" })).note).toBe(
			"effort field (GitHub refused: 403)"
		);
		await expect(make({ values: 500 }).setter.clear(7, { name: "Effort", type: "select" })).rejects.toMatchObject({
			status: 500,
		});
	});
});
