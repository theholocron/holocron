import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

import type { Probe } from "../../plugin/index.js";
import { NonInteractiveError } from "../../ui/non-interactive-error/index.js";
import { runProbe } from "./run-probe.js";

const strip = (s: string) => stripVTControlCharacters(s);

function run(probe: Probe, over: Partial<Parameters<typeof runProbe>[0]> = {}) {
	const lines: string[] = [];
	const promise = runProbe({
		name: "test thing",
		provider: "test",
		probeName: "thing",
		probe,
		dryRun: false,
		yes: false,
		interactive: false,
		onInterrupt: () => () => {},
		print: (l) => lines.push(strip(l)),
		...over,
	});
	return { promise, text: () => lines.join("\n") };
}

const reader = (fn: Probe["run"]): Probe => ({ summary: "reads", writes: false, run: fn });
const writer = (fn: Probe["run"]): Probe => ({ summary: "makes a thing", writes: true, run: fn });

describe("runProbe", () => {
	it("prints each row, counts them, and reports ok", async () => {
		const { promise, text } = run(
			reader(async (ctx) => {
				ctx.say({ status: "ok", label: "a" });
				ctx.say({ status: "info", label: "b", detail: "fact" });
			})
		);
		const report = await promise;
		expect(report.status).toBe("ok");
		expect(text()).toContain("a");
		expect(text()).toContain("b  fact");
		expect(text()).toContain("1 ok, 0 fail");
	});

	it("reports fail when a row fails or the probe throws, and says why", async () => {
		const failing = await run(reader(async (ctx) => ctx.say({ status: "fail", label: "x" }))).promise;
		expect(failing.status).toBe("fail");
		const thrown = run(
			reader(async () => {
				throw new Error("boom");
			})
		);
		expect((await thrown.promise).status).toBe("fail");
		expect(thrown.text()).toContain("boom");
	});

	it("scrubs what it prints: a marked secret, the run's tokens, and credential shapes", async () => {
		const { promise, text } = run(
			reader(async (ctx) => {
				ctx.secret("marked-secret-value");
				ctx.secret(undefined);
				ctx.say({
					status: "info",
					label: "marked-secret-value",
					detail: "tok-from-the-run and https://discord.com/api/webhooks/1/abc",
				});
			}),
			{ secrets: ["tok-from-the-run"] }
		);
		await promise;
		expect(text()).not.toMatch(/marked-secret-value|tok-from-the-run|webhooks\/1/);
		expect(text()).toContain("«hidden»");
	});

	it("strips control characters from what a probe says", async () => {
		const { promise, text } = run(
			reader(async (ctx) => ctx.say({ status: "info", label: "a\u001b[31mb\nc", detail: "d\ne" }))
		);
		await promise;
		expect(text()).toContain("a [31mb c  d e");
	});

	describe("a probe that writes", () => {
		it("refuses without a terminal or --yes, and does not run", async () => {
			const fn = vi.fn();
			await expect(run(writer(fn)).promise).rejects.toThrow(NonInteractiveError);
			expect(fn).not.toHaveBeenCalled();
		});

		it("asks on a terminal, and stops on no", async () => {
			const fn = vi.fn();
			const confirm = vi.fn(async (_message: string) => false);
			const { promise, text } = run(writer(fn), { interactive: true, confirm });
			expect((await promise).status).toBe("cancelled");
			expect(confirm.mock.calls[0]![0]).toContain("makes a thing");
			expect(fn).not.toHaveBeenCalled();
			expect(text()).toContain("nothing was changed");
		});

		it("runs on yes, or with --yes without asking", async () => {
			const fn = vi.fn(async () => {});
			await run(writer(fn), { interactive: true, confirm: async () => true }).promise;
			const confirm = vi.fn();
			await run(writer(fn), { yes: true, confirm }).promise;
			expect(fn).toHaveBeenCalledTimes(2);
			expect(confirm).not.toHaveBeenCalled();
		});

		it("asks nothing on a dry run, and does not change anything", async () => {
			const change = vi.fn(async () => "made");
			const undo = vi.fn(async () => {});
			const { promise, text } = run(
				writer(async (ctx) => {
					const made = await ctx.write("create a thing", change);
					expect(made).toBeUndefined();
					ctx.cleanup("the thing", undo);
				}),
				{ dryRun: true }
			);
			expect((await promise).status).toBe("ok");
			expect(change).not.toHaveBeenCalled();
			expect(undo).not.toHaveBeenCalled();
			expect(text()).toContain("would create a thing");
		});

		it("returns what a change returned", async () => {
			let got: string | undefined;
			await run(
				writer(async (ctx) => {
					got = await ctx.write("make", async () => "id-1");
				}),
				{ yes: true }
			).promise;
			expect(got).toBe("id-1");
		});
	});

	it("will not let a read-only probe write", async () => {
		const { promise, text } = run(
			reader(async (ctx) => {
				await ctx.write("delete it", async () => {});
			})
		);
		expect((await promise).status).toBe("fail");
		expect(text()).toContain("read-only");
	});

	describe("cleanup", () => {
		const order: string[] = [];
		const probe = (then: "ok" | "throw") =>
			writer(async (ctx) => {
				ctx.cleanup("first", async () => void order.push("first"));
				ctx.cleanup("second", async () => void order.push("second"));
				if (then === "throw") throw new Error("midway");
			});

		it("undoes in reverse after success and after a failure", async () => {
			order.length = 0;
			await run(probe("ok"), { yes: true }).promise;
			expect(order).toEqual(["second", "first"]);
			order.length = 0;
			const failed = await run(probe("throw"), { yes: true }).promise;
			expect(failed.status).toBe("fail");
			expect(order).toEqual(["second", "first"]);
		});

		it("keeps going when one undo fails, and says so", async () => {
			const ran: string[] = [];
			const { promise, text } = run(
				writer(async (ctx) => {
					ctx.cleanup("kept", async () => void ran.push("kept"));
					ctx.cleanup("broken", async () => {
						throw new Error("cannot delete");
					});
				}),
				{ yes: true }
			);
			expect((await promise).status).toBe("fail");
			expect(ran).toEqual(["kept"]);
			expect(text()).toContain("could not clean up broken");
			expect(text()).toContain("cannot delete");
		});

		it("undoes on an interrupt, once", async () => {
			const undo = vi.fn(async () => {});
			let interrupt: () => Promise<void> = async () => {};
			let stopped = false;
			const { promise } = run(
				writer(async (ctx) => {
					ctx.cleanup("thing", undo);
					await interrupt();
				}),
				{
					yes: true,
					onInterrupt: (handler) => {
						interrupt = handler;
						return () => void (stopped = true);
					},
				}
			);
			await promise;
			expect(undo).toHaveBeenCalledTimes(1);
			expect(stopped).toBe(true);
		});
	});

	describe("the default Ctrl-C handler", () => {
		it("undoes, exits 130, and is gone once the probe ends", async () => {
			const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
			const before = process.listenerCount("SIGINT");
			const undo = vi.fn(async () => {});
			let during = 0;
			const lines: string[] = [];
			await runProbe({
				name: "test thing",
				provider: "test",
				probeName: "thing",
				probe: writer(async (ctx) => {
					ctx.cleanup("thing", undo);
					during = process.listenerCount("SIGINT");
					process.emit("SIGINT");
					await new Promise((r) => setTimeout(r, 0));
				}),
				dryRun: false,
				yes: true,
				print: (l) => lines.push(l),
			});
			expect(during).toBe(before + 1);
			expect(undo).toHaveBeenCalledTimes(1);
			expect(exit).toHaveBeenCalledWith(130);
			expect(process.listenerCount("SIGINT")).toBe(before);
			exit.mockRestore();
		});
	});
});
