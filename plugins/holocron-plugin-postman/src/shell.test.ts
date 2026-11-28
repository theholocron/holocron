import type { spawnSync } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import { INSTALL_HINT, PostmanCli } from "./shell.js";

type Spawn = typeof spawnSync;
const spawn = (result: Record<string, unknown>) => vi.fn(() => result) as unknown as Spawn & ReturnType<typeof vi.fn>;

describe("PostmanCli", () => {
	it("runs `postman collection migrate <file> --output <dir>` with stdin attached", () => {
		const fake = spawn({ status: 0, stdout: "", stderr: "" });
		new PostmanCli({ spawn: fake }).migrate("/r/collection.json", "/out/collection");
		expect(fake).toHaveBeenCalledWith(
			"postman",
			["collection", "migrate", "/r/collection.json", "--output", "/out/collection"],
			{ encoding: "utf-8", stdio: ["inherit", "pipe", "pipe"] }
		);
	});

	it("runs the binary it is given", () => {
		const fake = spawn({ status: 0 });
		const cli = new PostmanCli({ spawn: fake, binary: "/opt/postman" });
		cli.migrate("a", "b");
		expect(cli.binary).toBe("/opt/postman");
		expect(fake.mock.calls[0]![0]).toBe("/opt/postman");
	});

	it("defaults to the real spawn and the `postman` binary", () => {
		expect(new PostmanCli().binary).toBe("postman");
	});

	it("says how to install the CLI when it is not on the PATH", () => {
		const error = Object.assign(new Error("spawn postman ENOENT"), { code: "ENOENT" });
		const fake = spawn({ error });
		expect(() => new PostmanCli({ spawn: fake }).migrate("a", "b")).toThrow(
			`the Postman CLI (\`postman\`) is not installed: ${INSTALL_HINT}`
		);
	});

	it("reports any other failure to start it", () => {
		const fake = spawn({ error: new Error("EACCES") });
		expect(() => new PostmanCli({ spawn: fake }).migrate("a", "b")).toThrow("could not run `postman`: EACCES");
	});

	it("throws the CLI's own message on a non-zero exit, preferring stderr", () => {
		const fake = spawn({ status: 1, stdout: "out text", stderr: " bad collection \n" });
		expect(() => new PostmanCli({ spawn: fake }).migrate("c.json", "b")).toThrow(
			"`postman collection migrate` failed for c.json: bad collection"
		);
	});

	it("falls back to stdout, then to the exit status, when stderr is empty", () => {
		const cli = (r: Record<string, unknown>) => new PostmanCli({ spawn: spawn(r) });
		expect(() => cli({ status: 2, stdout: "only stdout", stderr: "" }).migrate("c", "b")).toThrow(/only stdout/);
		expect(() => cli({ status: 3 }).migrate("c", "b")).toThrow(/exit status 3/);
	});
});
