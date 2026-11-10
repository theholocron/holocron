import { describe, expect, it, vi } from "vitest";

import { report, safely, safelyAsync } from "./safe.js";

describe("report", () => {
	it("passes the error and context to onError", () => {
		const onError = vi.fn();
		const error = new Error("x");
		report(onError, error, "ctx");
		expect(onError).toHaveBeenCalledWith(error, "ctx");
	});
	it("does nothing without onError", () => {
		expect(() => report(undefined, new Error("x"), "ctx")).not.toThrow();
	});
	it("drops a throw from onError and does not call it again", () => {
		const onError = vi.fn(() => {
			throw new Error("reporter broke");
		});
		expect(() => report(onError, new Error("x"), "ctx")).not.toThrow();
		expect(onError).toHaveBeenCalledTimes(1);
	});
});

describe("safely", () => {
	it("returns the value", () => {
		expect(safely(() => 3)).toBe(3);
	});
	it("returns undefined and reports a throw with its context", () => {
		const onError = vi.fn();
		const error = new Error("boom");
		const result = safely(
			() => {
				throw error;
			},
			onError,
			"sentry.init"
		);
		expect(result).toBeUndefined();
		expect(onError).toHaveBeenCalledWith(error, "sentry.init");
	});
	it("swallows a throw when there is no onError", () => {
		expect(
			safely(() => {
				throw new Error("boom");
			})
		).toBeUndefined();
	});
});

describe("safelyAsync", () => {
	it("returns the value", async () => {
		await expect(safelyAsync(() => Promise.resolve(4))).resolves.toBe(4);
	});
	it("reports a rejection with its context and resolves undefined", async () => {
		const onError = vi.fn();
		const error = new Error("offline");
		await expect(safelyAsync(() => Promise.reject(error), onError, "flush")).resolves.toBeUndefined();
		expect(onError).toHaveBeenCalledWith(error, "flush");
	});
	it("swallows a rejection when there is no onError", async () => {
		await expect(safelyAsync(() => Promise.reject(new Error("x")))).resolves.toBeUndefined();
	});
});
