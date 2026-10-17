import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it, vi } from "vitest";

/**
 * The real ShellCheck engine never exits >1 for a script it can parse, so
 * the "ShellCheck rejected its own invocation" path needs a stand-in
 * engine — kept in its own file so the module-level mock can't leak into
 * `lint-actionlint.test.ts`'s real-engine tests.
 */
const dispose = vi.fn(() => Promise.resolve());
vi.mock("@vscode-shellcheck/shellcheck-wasm", () => ({
	wasmUrl: new URL("file:///unused.wasm"),
	createShellCheck: () => ({
		lint: () => Promise.resolve({ exitCode: 3, stdout: "", stderr: "  unknown option -z\n" }),
		dispose,
	}),
}));
vi.mock("node:fs/promises", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs/promises")>()),
	// The smallest valid WASM module (magic + version) — lint-actionlint compiles it before handing it to the stand-in engine.
	readFile: () => Promise.resolve(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])),
}));

const { lintActionlint } = await import("./lint-actionlint.js");

describe("lintActionlint — ShellCheck rejecting its own invocation", () => {
	it("throws with ShellCheck's exit code and stderr, and still disposes the engine", async () => {
		const workflow = "on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n";
		const { fetch } = stubFetch([
			{ status: 200, body: [{ filename: ".github/workflows/ci.yml", status: "modified" }] },
			{ status: 200, body: { content: Buffer.from(workflow).toString("base64"), encoding: "base64" } },
		]);
		const client = createGitHubClient({ token: "ghp_test", fetch });

		const err = await lintActionlint({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" }).catch(
			(e: unknown) => e
		);

		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("shellcheck exited 3: unknown option -z");
		expect(dispose).toHaveBeenCalledOnce();
	});
});
