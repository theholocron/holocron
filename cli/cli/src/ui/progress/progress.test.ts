import { createRestClient } from "@theholocron/http-client";
import { describe, expect, it } from "vitest";

import { createProgress, retryNotice, withProgress } from "./progress.js";

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

describe("retryNotice", () => {
	it("says on the spinner when a request is being retried, and stops listening when it is unhooked", async () => {
		const texts: string[] = [];
		const unhook = retryNotice("source: update settings…", (text) => texts.push(text));
		await client("GitHub").request("/x");
		await client().request("/x");
		unhook();
		await client("GitHub").request("/x");
		expect(texts).toEqual([
			"source: update settings… (retrying GitHub, attempt 2 of 3)",
			"source: update settings… (retrying the request, attempt 2 of 3)",
		]);
	});
});

describe("createProgress and withProgress", () => {
	it("run a step and give back its result, and draw nothing off a terminal", async () => {
		const lines: string[] = [];
		const progress = createProgress((l) => lines.push(l));
		await expect(progress.run("step…", async () => 7)).resolves.toBe(7);
		progress.print("a line");
		expect(lines).toEqual(["a line"]);
		await expect(withProgress("working…", async () => "done")).resolves.toBe("done");
	});
});
