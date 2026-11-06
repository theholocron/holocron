import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedOptions } from "../../prompts/index.js";

const deferredMock = vi.fn();
vi.mock("../../prompts/index.js", () => ({ promptForDeferredOptions: (...a: unknown[]) => deferredMock(...a) }));

const { resolveForRealSpawn } = await import("./resolve-for-real-spawn.js");

describe("resolveForRealSpawn", () => {
	beforeEach(() => deferredMock.mockReset());

	it("is a no-op when nothing was deferred", async () => {
		const none: ResolvedOptions = { options: [], answers: { a: "1" } };
		expect(await resolveForRealSpawn(none)).toBe(none);
		const empty: ResolvedOptions = { ...none, deferred: [] };
		expect(await resolveForRealSpawn(empty)).toBe(empty);
		expect(deferredMock).not.toHaveBeenCalled();
	});

	it("folds the deferred answers into the existing ones", async () => {
		const deferred = [{ key: "otp", flag: "--otp", type: "password" as const, message: "" }];
		deferredMock.mockResolvedValue({ otp: "123456" });
		const result = await resolveForRealSpawn({ options: [], answers: { a: "1" }, deferred });
		expect(result.answers).toEqual({ a: "1", otp: "123456" });
		expect(deferredMock).toHaveBeenCalledWith(deferred);
	});
});
