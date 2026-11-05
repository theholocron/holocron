import { afterEach, describe, expect, it, vi } from "vitest";

import type { DevServer } from "../dev-server/index.js";
import { serveHandler } from "./serve-handler.js";

const open: DevServer[] = [];
afterEach(async () => {
	for (const server of open.splice(0)) await server.close();
	delete process.env["DAGOBAH_TEST_SECRET"];
	process.removeAllListeners("SIGINT");
	process.removeAllListeners("SIGTERM");
});

const serve = async (over: Partial<Parameters<typeof serveHandler<"DAGOBAH_TEST_SECRET">>[0]> = {}) => {
	const lines: string[] = [];
	const server = await serveHandler({
		environment: "Dev",
		required: ["DAGOBAH_TEST_SECRET"],
		env: { DAGOBAH_TEST_SECRET: "s3" },
		port: 0,
		log: (l) => lines.push(l),
		onSignal: () => {},
		handler: async () => async (_request, env) => new Response(`secret=${env.DAGOBAH_TEST_SECRET}`),
		...over,
	});
	open.push(server);
	return { server, lines };
};

describe("serveHandler", () => {
	it("serves the handler with the loaded environment and says where it listens", async () => {
		const { server, lines } = await serve();
		const res = await fetch(server.url);
		expect(await res.text()).toBe("secret=s3");
		expect(lines).toContain(`listening on ${server.url}, secrets from "Dev"`);
	});

	it("puts the environment in process.env before it imports the handler", async () => {
		let seen: string | undefined;
		await serve({
			handler: async () => {
				seen = process.env["DAGOBAH_TEST_SECRET"];
				return async () => new Response("ok");
			},
		});
		expect(seen).toBe("s3");
	});

	it("says where logs go only when told which variables to read", async () => {
		const quiet = await serve();
		expect(quiet.lines.some((l) => l.startsWith("logs:"))).toBe(false);
		const loud = await serve({ logging: { tokenVar: "T", datasetVar: "D" } });
		expect(loud.lines.some((l) => l.startsWith("logs: not shipped"))).toBe(true);
	});

	it("serves at the given path, and stops through onSignal on SIGTERM", async () => {
		const onSignal = vi.fn();
		const { server } = await serve({ path: "/hook", onSignal });
		expect(server.url.endsWith("/hook")).toBe(true);
		process.emit("SIGTERM");
		expect(onSignal).toHaveBeenCalledWith(server.close);
	});

	it("fails, naming what is missing, when a required variable is in neither place", async () => {
		await expect(serve({ env: {}, environment: "Dev" })).rejects.toThrow(
			/could not read the 1Password Environment|missing/
		);
	});

	it("prints with console.log, and exits 0 once the server is closed, by default", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

		const server = await serveHandler({
			environment: "Dev",
			required: ["DAGOBAH_TEST_SECRET"],
			env: { DAGOBAH_TEST_SECRET: "s3" },
			port: 0,
			handler: async () => async () => new Response("ok"),
		});
		open.push(server);
		expect(log).toHaveBeenCalledWith(expect.stringContaining("listening on"));
		process.emit("SIGINT");
		await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
		log.mockRestore();
		exit.mockRestore();
	});

	it("reads process.env when given no env", async () => {
		process.env["DAGOBAH_TEST_SECRET"] = "p";
		const server = await serveHandler({
			environment: "Dev",
			required: ["DAGOBAH_TEST_SECRET"],
			port: 0,
			log: () => {},
			onSignal: () => {},
			handler: async () => async () => new Response("ok"),
		});
		open.push(server);
		expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/webhook$/);
	});
});
