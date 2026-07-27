import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ora", () => {
	const spinner = { succeed: vi.fn(), fail: vi.fn() };
	return { default: vi.fn(() => ({ start: () => spinner, ...spinner })) };
});

import ora from "ora";

import { withSpinner } from "../ui/progress.js";

describe("withSpinner", () => {
	describe("non-TTY (isTTY = false)", () => {
		it("runs fn directly without creating a spinner", async () => {
			Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
			const fn = vi.fn(async () => 42);

			const result = await withSpinner("label", fn);

			expect(result).toBe(42);
			expect(ora).not.toHaveBeenCalled();
		});

		it("propagates errors from fn", async () => {
			Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });

			await expect(
				withSpinner("label", async () => {
					throw new Error("boom");
				})
			).rejects.toThrow("boom");
		});
	});

	describe("TTY (isTTY = true)", () => {
		beforeEach(() => {
			Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
			vi.mocked(ora).mockClear();
		});

		afterEach(() => {
			Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
		});

		it("starts a spinner, calls fn, and marks success", async () => {
			const fn = vi.fn(async () => "done");

			const result = await withSpinner("doing work", fn);

			expect(result).toBe("done");
			expect(ora).toHaveBeenCalledWith("doing work");
			const spinner = vi.mocked(ora).mock.results[0]!.value as { succeed: ReturnType<typeof vi.fn> };
			expect(spinner.succeed).toHaveBeenCalled();
		});

		it("marks the spinner failed and re-throws when fn throws", async () => {
			await expect(
				withSpinner("doing work", async () => {
					throw new Error("network error");
				})
			).rejects.toThrow("network error");

			const spinner = vi.mocked(ora).mock.results[0]!.value as { fail: ReturnType<typeof vi.fn> };
			expect(spinner.fail).toHaveBeenCalled();
		});
	});
});
