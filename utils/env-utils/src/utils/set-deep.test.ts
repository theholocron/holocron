import { describe, expect, it } from "vitest";
import type { EnvObject } from "../types.js";
import { setDeep } from "./set-deep.js";

describe("setDeep", () => {
	it("writes a string value at a single-segment path", () => {
		const target: EnvObject = {};
		setDeep(target, ["database_url"], "postgres://localhost");
		expect(target).toEqual({ database_url: "postgres://localhost" });
	});

	it("writes a number value at a single-segment path", () => {
		const target: EnvObject = {};
		setDeep(target, ["port"], 3000);
		expect(target).toEqual({ port: 3000 });
	});

	it("writes a boolean value at a single-segment path", () => {
		const target: EnvObject = {};
		setDeep(target, ["debug"], true);
		expect(target).toEqual({ debug: true });
	});

	it("overwrites an existing primitive at a single-segment path", () => {
		const target: EnvObject = { port: 3000 };
		setDeep(target, ["port"], 4000);
		expect(target).toEqual({ port: 4000 });
	});

	it("creates intermediate namespaces for a nested path", () => {
		const target: EnvObject = {};
		setDeep(target, ["db", "host"], "localhost");
		expect(target).toEqual({ db: { host: "localhost" } });
	});

	it("writes a value at a three-segment path", () => {
		const target: EnvObject = {};
		setDeep(target, ["allm", "service", "url"], "http://allm");
		expect(target).toEqual({ allm: { service: { url: "http://allm" } } });
	});

	it("merges into an existing namespace without overwriting siblings", () => {
		const target: EnvObject = { db: { host: "localhost" } };
		setDeep(target, ["db", "port"], 5432);
		expect(target).toEqual({ db: { host: "localhost", port: 5432 } });
	});

	it("writes multiple values into the same deeply nested namespace", () => {
		const target: EnvObject = {};
		setDeep(target, ["db", "primary", "host"], "localhost");
		setDeep(target, ["db", "primary", "port"], 5432);
		setDeep(target, ["db", "primary", "name"], "mydb");
		expect(target).toEqual({
			db: { primary: { host: "localhost", port: 5432, name: "mydb" } },
		});
	});

	it("does not mutate other top-level keys", () => {
		const target: EnvObject = { port: 3000, debug: false };
		setDeep(target, ["db", "url"], "postgres://localhost");
		expect(target["port"]).toBe(3000);
		expect(target["debug"]).toBe(false);
	});

	it("throws when an intermediate key already holds a scalar value", () => {
		const target: EnvObject = { db: "scalar" };
		expect(() =>
			setDeep(target, ["db", "url"], "postgres://localhost"),
		).toThrow(/Key collision/);
	});

	it("includes the colliding key path in the scalar-to-namespace error message", () => {
		const target: EnvObject = { allm: { service: "scalar" } };
		expect(() =>
			setDeep(target, ["allm", "service", "url"], "http://allm"),
		).toThrow("allm.service");
	});

	it("throws at the first colliding segment, not the full path", () => {
		const target: EnvObject = { a: "scalar" };
		expect(() => setDeep(target, ["a", "b", "c"], "value")).toThrow(/a/);
	});

	it("throws when the leaf key already holds a namespace object", () => {
		const target: EnvObject = { db: { url: "postgres://localhost" } };
		expect(() => setDeep(target, ["db"], "scalar")).toThrow(
			/Key collision/,
		);
	});

	it("includes the full path in the namespace-to-scalar error message", () => {
		const target: EnvObject = { allm: { service: { url: "http://allm" } } };
		expect(() => setDeep(target, ["allm", "service"], "scalar")).toThrow(
			"allm.service",
		);
	});

	it("mutates the target in place rather than returning a new object", () => {
		const target: EnvObject = {};
		const ref = target;
		setDeep(target, ["port"], 3000);
		expect(target).toBe(ref);
	});
});
