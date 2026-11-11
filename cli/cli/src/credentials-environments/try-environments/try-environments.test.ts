import { describe, expect, it } from "vitest";

import type { EnvironmentCandidate } from "../environment-layers/index.js";
import { tryEnvironments } from "./try-environments.js";

const c = (name: string, optional = false): EnvironmentCandidate => ({ name, optional });
const absent = Object.assign(new Error("not found"), { status: 404 });
const holding =
	(...names: string[]) =>
	async (name: string) => {
		if (!names.includes(name)) throw absent;
		return name.toUpperCase();
	};

describe("tryEnvironments", () => {
	it("returns what each existing Environment gave, in order", async () => {
		const out = await tryEnvironments([c("a", true), c("b")], holding("a", "b"));
		expect(out.found.map((f) => [f.name, f.result])).toEqual([
			["a", "A"],
			["b", "B"],
		]);
		expect(out.missing).toEqual([]);
	});

	it("ignores a missing optional Environment", async () => {
		expect((await tryEnvironments([c("a", true), c("b")], holding("b"))).missing).toEqual([]);
	});

	it("reports a missing required Environment by name", async () => {
		expect((await tryEnvironments([c("a", true), c("b")], holding("a"))).missing).toEqual(["b"]);
	});

	it("rethrows an error that is not a 404", async () => {
		const err = await tryEnvironments([c("a")], async () => Promise.reject(new Error("locked"))).catch(
			(e: unknown) => e
		);
		expect((err as Error).message).toBe("locked");
	});
});
