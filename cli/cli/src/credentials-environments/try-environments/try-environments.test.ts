import { describe, expect, it } from "vitest";

import type { EnvironmentCandidate } from "../environment-layers/index.js";
import { tryEnvironments } from "./try-environments.js";

const c = (name: string, optional = false, legacy = false): EnvironmentCandidate => ({ name, optional, legacy });
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

	it("tries the legacy names only after a miss, and forgives it when one exists", async () => {
		const asked: string[] = [];
		const attempt = async (name: string) => {
			asked.push(name);
			return holding("old")(name);
		};
		const out = await tryEnvironments([c("new"), c("old", true, true)], attempt);
		expect(out.missing).toEqual([]);
		expect(out.found).toEqual([{ name: "old", legacy: true, result: "OLD" }]);
		expect(asked).toEqual(["new", "old"]);
	});

	it("does not try the legacy names when nothing required is missing", async () => {
		const asked: string[] = [];
		await tryEnvironments([c("new"), c("old", true, true)], async (n) => {
			asked.push(n);
			return n;
		});
		expect(asked).toEqual(["new"]);
	});

	it("still reports the miss when no legacy name exists either", async () => {
		expect((await tryEnvironments([c("new"), c("old", true, true)], holding())).missing).toEqual(["new"]);
	});

	it("rethrows an error that is not a 404", async () => {
		const err = await tryEnvironments([c("a")], async () => Promise.reject(new Error("locked"))).catch(
			(e: unknown) => e
		);
		expect((err as Error).message).toBe("locked");
	});
});
