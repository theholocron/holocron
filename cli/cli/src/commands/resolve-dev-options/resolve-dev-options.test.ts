import { describe, expect, it } from "vitest";

import { resolveDevOptions } from "./resolve-dev-options.js";

const config = {
	environment: "Sentinel - dev",
	tunnel: { name: "sentinel-dev", hostname: "sentinel-dev.example.dev" },
	port: 4000,
	command: ["pnpm", "run", "serve"],
};

describe("resolveDevOptions", () => {
	it("takes everything from the dev block when nothing is passed", () => {
		expect(resolveDevOptions({}, config)).toEqual({
			environment: "Sentinel - dev",
			name: "sentinel-dev",
			hostname: "sentinel-dev.example.dev",
			port: 4000,
			command: ["pnpm", "run", "serve"],
		});
	});

	it("lets each flag win over the config", () => {
		const resolved = resolveDevOptions(
			{ environment: "E", name: "n", hostname: "h.example.dev", port: 5000, command: ["node", "app.js"] },
			config
		);
		expect(resolved).toEqual({
			environment: "E",
			name: "n",
			hostname: "h.example.dev",
			port: 5000,
			command: ["node", "app.js"],
		});
	});

	it("falls back to the config for a command that is an empty list, and to port 3000 for neither", () => {
		const { port: _port, ...noPort } = config;
		expect(resolveDevOptions({ command: [] }, config).command).toEqual(["pnpm", "run", "serve"]);
		expect(resolveDevOptions({}, noPort).port).toBe(3000);
	});

	it("works from flags alone, with no dev block", () => {
		expect(
			resolveDevOptions({ environment: "E", name: "n", hostname: "h.example.dev", command: ["x"] }, undefined)
		).toEqual({ environment: "E", name: "n", hostname: "h.example.dev", port: 3000, command: ["x"] });
	});

	it("names everything that is missing, and where to give it", () => {
		const err = (() => {
			try {
				resolveDevOptions({}, undefined);
			} catch (e) {
				return e as Error;
			}
		})();
		expect(err?.message).toBe(
			"dev needs an environment (--environment, or `dev.environment`); a tunnel name (--name, or `dev.tunnel.name`); a hostname (--hostname, or `dev.tunnel.hostname`); the application's command (after --, or `dev.command`), in holocron.config.ts or on the command line"
		);
	});

	it("names only what is missing", () => {
		expect(() => resolveDevOptions({}, { environment: "E", command: ["x"] })).toThrow(
			/^dev needs a tunnel name \(--name, or `dev\.tunnel\.name`\); a hostname/
		);
	});
});
