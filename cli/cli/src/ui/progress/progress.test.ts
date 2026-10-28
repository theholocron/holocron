import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ora", () => {
	const spinner = { succeed: vi.fn(), fail: vi.fn(), stop: vi.fn(), start: vi.fn() };
	spinner.start.mockImplementation(() => spinner);
	return { default: vi.fn(() => spinner) };
});

import { createRestClient } from "@theholocron/http-client";
import ora from "ora";

import { allowProgress, createProgress, progressEnabled, withProgress, withSpinner } from "./progress.js";

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

describe("progress", () => {
	const setTTY = (out: boolean, err: boolean) => {
		Object.defineProperty(process.stdout, "isTTY", { value: out, configurable: true });
		Object.defineProperty(process.stderr, "isTTY", { value: err, configurable: true });
	};
	const spinner = () =>
		vi.mocked(ora).mock.results[0]!.value as Record<string, ReturnType<typeof vi.fn>> & { text: string };

	beforeEach(() => {
		vi.mocked(ora).mockClear();
		allowProgress(true);
		vi.stubEnv("CI", "");
		setTTY(true, true);
	});

	afterEach(() => {
		setTTY(false, false);
		allowProgress(true);
		vi.unstubAllEnvs();
	});

	describe("progressEnabled", () => {
		it("is on only for a person at a terminal: both streams, not CI, not switched off", () => {
			expect(progressEnabled()).toBe(true);
			setTTY(true, false);
			expect(progressEnabled()).toBe(false);
			setTTY(false, true);
			expect(progressEnabled()).toBe(false);
			setTTY(true, true);
			vi.stubEnv("CI", "true");
			expect(progressEnabled()).toBe(false);
			vi.stubEnv("CI", "");
			allowProgress(false);
			expect(progressEnabled()).toBe(false);
		});
	});

	describe("createProgress", () => {
		it("draws nothing and prints straight through when it is off", async () => {
			const lines: string[] = [];
			const progress = createProgress(
				(l) => lines.push(l),
				() => false
			);
			await expect(progress.run("step…", async () => 7)).resolves.toBe(7);
			progress.print("a line");
			expect(ora).not.toHaveBeenCalled();
			expect(lines).toEqual(["a line"]);
		});

		it("shows the step on stderr, and clears it when the step ends, whether it worked or not", async () => {
			const progress = createProgress(() => {});
			await progress.run("role admin…", async () => {});
			expect(ora).toHaveBeenCalledWith(expect.objectContaining({ text: "role admin…", stream: process.stderr }));
			expect(spinner().stop).toHaveBeenCalledTimes(1);
			await expect(
				progress.run("again…", async () => {
					throw new Error("boom");
				})
			).rejects.toThrow("boom");
			expect(spinner().stop).toHaveBeenCalledTimes(2);
		});

		it("says on the spinner when a request is being retried, and stops listening when the step ends", async () => {
			const flaky = () => {
				let failed = false;
				return (async () => {
					if (!failed) {
						failed = true;
						throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
					}
					return new Response("{}", { status: 200 });
				}) as typeof fetch;
			};
			const client = (vendor?: string) =>
				createRestClient({
					baseUrl: "https://api.test",
					token: "t",
					fetch: flaky(),
					retryDelayMs: 0,
					...(vendor ? { vendor } : {}),
				});
			const progress = createProgress(() => {});
			await progress.run("source: update settings…", async () => {
				await client("GitHub").request("/x");
				expect(spinner().text).toBe("source: update settings… (retrying GitHub, attempt 2 of 3)");
				await client().request("/x");
				expect(spinner().text).toBe("source: update settings… (retrying the request, attempt 2 of 3)");
			});
			spinner().text = "untouched";
			await client("GitHub").request("/x");
			expect(spinner().text).toBe("untouched");
		});

		it("clears the spinner around a line printed during a step, and prints plainly after it", async () => {
			const order: string[] = [];
			const lines: string[] = [];
			const progress = createProgress((l) => {
				order.push("print");
				lines.push(l);
			});
			vi.mocked(ora).mockClear();
			await progress.run("step…", async () => {
				const s = spinner();
				s.stop!.mockImplementation(() => void order.push("stop"));
				s.start!.mockImplementation(() => (order.push("start"), s));
				progress.print("✓ created");
			});
			progress.print("after");
			expect(order).toEqual(["stop", "print", "start", "stop", "print"]);
			expect(lines).toEqual(["✓ created", "after"]);
		});
	});

	describe("withProgress", () => {
		it("runs the step under a spinner and gives back its result", async () => {
			await expect(withProgress("working…", async () => "done")).resolves.toBe("done");
			expect(ora).toHaveBeenCalledWith(expect.objectContaining({ text: "working…" }));
		});

		it("does not draw one off a terminal", async () => {
			setTTY(false, false);
			await expect(withProgress("working…", async () => 1)).resolves.toBe(1);
			expect(ora).not.toHaveBeenCalled();
		});
	});
});
