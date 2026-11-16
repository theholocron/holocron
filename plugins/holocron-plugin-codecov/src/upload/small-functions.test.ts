import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { stubSpawn } from "./__tests__/stub-spawn.js";
import { CODECOV_OIDC_AUDIENCE, fetchOidcToken } from "./fetch-oidc-token.js";
import { namesSourceFile } from "./names-source-file.js";
import { parseChecksum } from "./parse-checksum.js";
import { retryWithWait } from "./retry-with-wait.js";
import { reportPackageDir, rootReport } from "./root-report.js";
import { sha256Matches } from "./sha256-matches.js";
import { verifySignature } from "./verify-signature.js";

describe("sha256Matches", () => {
	const bytes = new TextEncoder().encode("codecov");
	const digest = createHash("sha256").update(bytes).digest("hex");

	it("accepts the digest, in either case and with surrounding space", () => {
		expect(sha256Matches(bytes, digest)).toBe(true);
		expect(sha256Matches(bytes, ` ${digest.toUpperCase()}\n`)).toBe(true);
	});

	it("rejects another digest", () => {
		expect(sha256Matches(bytes, "0".repeat(64))).toBe(false);
		expect(sha256Matches(new TextEncoder().encode("other"), digest)).toBe(false);
	});
});

describe("parseChecksum", () => {
	const hex = "ab".repeat(32);

	it("finds the digest for a name, in text and binary mode, lowercased", () => {
		expect(parseChecksum(`${hex.toUpperCase()}  codecov\n`, "codecov")).toBe(hex);
		expect(parseChecksum(`${hex} *codecov`, "codecov")).toBe(hex);
		expect(parseChecksum(`${"cd".repeat(32)}  other\r\n${hex}  codecov\r\n`, "codecov")).toBe(hex);
	});

	it("returns undefined for a missing name, a short digest or a malformed line", () => {
		expect(parseChecksum(`${hex}  other\n`, "codecov")).toBeUndefined();
		expect(parseChecksum(`abc  codecov\n`, "codecov")).toBeUndefined();
		expect(parseChecksum("", "codecov")).toBeUndefined();
	});
});

describe("verifySignature", () => {
	const input = {
		publicKey: "KEY",
		checksumPath: "/d/sums",
		signaturePath: "/d/sums.sig",
		gnupgHome: "/d/gnupg",
	};

	it("imports the key into the private home, then verifies the signature", () => {
		const { spawn, calls } = stubSpawn([{ status: 0 }, { status: 0 }]);
		expect(verifySignature({ ...input, spawn })).toBe(true);
		expect(calls[0]).toMatchObject({
			binary: "gpg",
			args: ["--homedir", "/d/gnupg", "--batch", "--import"],
			input: "KEY",
		});
		expect(calls[1]?.args).toEqual(["--homedir", "/d/gnupg", "--batch", "--verify", "/d/sums.sig", "/d/sums"]);
	});

	it("is false when the key cannot be imported, and does not verify", () => {
		const { spawn, calls } = stubSpawn([{ status: 2 }]);
		expect(verifySignature({ ...input, spawn })).toBe(false);
		expect(calls).toHaveLength(1);
	});

	it("is false when gpg is missing", () => {
		const { spawn } = stubSpawn([{ error: new Error("ENOENT") }]);
		expect(verifySignature({ ...input, spawn })).toBe(false);
	});

	it("is false when the signature is bad, or gpg fails to run the check", () => {
		expect(verifySignature({ ...input, spawn: stubSpawn([{ status: 0 }, { status: 1 }]).spawn })).toBe(false);
		expect(
			verifySignature({ ...input, spawn: stubSpawn([{ status: 0 }, { error: new Error("boom") }]).spawn })
		).toBe(false);
	});
});

describe("reportPackageDir", () => {
	it.each([
		["clients/doppler-client/coverage/lcov.info", "clients/doppler-client"],
		["skills/lcov.info", "skills"],
		["lcov.info", ""],
		["coverage/lcov.info", ""],
		["./coverage/lcov.info", ""],
		["a/coverage/coverage/lcov.info", "a/coverage"],
		["/abs/pkg/coverage/lcov.info", "/abs/pkg"],
	])("%s is in %j", (path, dir) => {
		expect(reportPackageDir(path)).toBe(dir);
	});
});

describe("rootReport", () => {
	it("prefixes relative SF: lines with the package folder and keeps the rest", () => {
		const report = "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record\nSF:/abs/x.ts\nSF:../up.ts\nSF:\n";
		expect(rootReport(report, "utils/array-utils/coverage/lcov.info")).toBe(
			"TN:\nSF:utils/array-utils/src/index.ts\nDA:1,1\nend_of_record\nSF:/abs/x.ts\nSF:utils/array-utils/../up.ts\nSF:utils/array-utils/\n"
		);
	});

	it("only touches a line that starts with SF:", () => {
		expect(rootReport("XSF:a\n  SF:b\nSF:c\n", "p/coverage/lcov.info")).toBe("XSF:a\n  SF:b\nSF:p/c\n");
	});

	it("ends the copy with a newline, as awk does, and keeps a carriage return", () => {
		expect(rootReport("SF:a\r\nDA:1,1", "p/coverage/lcov.info")).toBe("SF:p/a\r\nDA:1,1\n");
	});

	it("gives an empty report back empty", () => {
		expect(rootReport("", "p/coverage/lcov.info")).toBe("");
	});

	it("returns a report at the repo root exactly as it is", () => {
		const report = "SF:src/index.ts\nno trailing newline";
		expect(rootReport(report, "coverage/lcov.info")).toBe(report);
		expect(rootReport(report, "lcov.info")).toBe(report);
	});
});

describe("namesSourceFile", () => {
	it("is true when a line starts with SF:", () => {
		expect(namesSourceFile("TN:\nSF:src/a.ts\n")).toBe(true);
		expect(namesSourceFile("SF:a")).toBe(true);
	});

	it("is false for a report with none, an SF: that is not at a line start, or no content", () => {
		expect(namesSourceFile("TN:\nend_of_record\n")).toBe(false);
		expect(namesSourceFile(" SF:a\n")).toBe(false);
		expect(namesSourceFile("")).toBe(false);
	});
});

describe("retryWithWait", () => {
	it("returns the first success without waiting", async () => {
		const sleep = vi.fn(async () => {});
		const attempt = vi.fn(async () => "ok");
		await expect(retryWithWait({ attempt, attempts: 4, waitMs: () => 1, sleep })).resolves.toBe("ok");
		expect(attempt).toHaveBeenCalledWith(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("waits the given time after each failed try, reports it, and stops at the first success", async () => {
		const sleep = vi.fn(async () => {});
		const onRetry = vi.fn();
		const attempt = vi.fn(async (n: number) => {
			if (n < 3) throw new Error(`no ${n}`);
			return n;
		});
		await expect(retryWithWait({ attempt, attempts: 4, waitMs: (n) => n * 15_000, sleep, onRetry })).resolves.toBe(
			3
		);
		expect(sleep.mock.calls).toEqual([[15_000], [30_000]]);
		expect(onRetry.mock.calls.map(([n, , wait]) => [n, wait])).toEqual([
			[1, 15_000],
			[2, 30_000],
		]);
	});

	it("rethrows the last failure after every try, without a wait after the last", async () => {
		const sleep = vi.fn(async () => {});
		const attempt = vi.fn(async (n: number) => {
			throw new Error(`no ${n}`);
		});
		const err = await retryWithWait({ attempt, attempts: 4, waitMs: () => 1, sleep }).catch((e: unknown) => e);
		expect((err as Error).message).toBe("no 4");
		expect(attempt).toHaveBeenCalledTimes(4);
		expect(sleep).toHaveBeenCalledTimes(3);
	});
});

describe("fetchOidcToken", () => {
	const make = (res: { ok?: boolean; status?: number; body?: unknown; badJson?: boolean }) => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const fetchStub = (async (url: string, init?: RequestInit) => {
			calls.push({ url, ...(init === undefined ? {} : { init }) });
			return {
				ok: res.ok ?? true,
				status: res.status ?? 200,
				json: async () => {
					if (res.badJson) throw new SyntaxError("bad");
					return res.body;
				},
			};
		}) as unknown as typeof fetch;
		return { fetch: fetchStub, calls };
	};

	it("asks the runtime for a token for Codecov with the bearer, and returns the value", async () => {
		const { fetch, calls } = make({ body: { value: "tok" } });
		await expect(
			fetchOidcToken({ requestUrl: "https://run.test/token?x=1", requestToken: "bearer-secret", fetch })
		).resolves.toBe("tok");
		expect(calls[0]?.url).toBe(`https://run.test/token?x=1&audience=${CODECOV_OIDC_AUDIENCE}`);
		expect(calls[0]?.init?.headers).toEqual({ authorization: "bearer bearer-secret" });
	});

	it("starts the query when the URL has none", async () => {
		const { fetch, calls } = make({ body: { value: "tok" } });
		await fetchOidcToken({ requestUrl: "https://run.test/token", requestToken: "b", fetch });
		expect(calls[0]?.url).toBe("https://run.test/token?audience=https://codecov.io");
	});

	it("throws, without the bearer, on a failed request", async () => {
		const { fetch } = make({ ok: false, status: 403 });
		const err = await fetchOidcToken({
			requestUrl: "https://run.test/t",
			requestToken: "bearer-secret",
			fetch,
		}).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/answered 403/);
		expect((err as Error).message).not.toContain("bearer-secret");
	});

	it.each([
		[{ body: {} }],
		[{ body: { value: "" } }],
		[{ body: { value: 5 } }],
		[{ body: undefined }],
		[{ badJson: true }],
	])("throws when the answer has no value (%j)", async (res) => {
		const { fetch } = make(res);
		await expect(fetchOidcToken({ requestUrl: "https://run.test/t", requestToken: "b", fetch })).rejects.toThrow(
			/no value/
		);
	});
});
