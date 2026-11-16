import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

import type { Coverage, CoverageUploadResult } from "../../../plugin/index.js";
import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { runUploadCoverage } from "./run-upload-coverage.js";
import type { RunUploadCoverageInput } from "./run-upload-coverage.type.js";

const UPLOADS = JSON.stringify([{ flag: "utils", files: "utils/*/coverage/lcov.info" }]);

function provider(result: CoverageUploadResult | Error | undefined, withUpload = true): Coverage {
	return {
		key: "coverage",
		providerName: "codecov",
		checkToken: vi.fn(),
		...(withUpload
			? {
					upload: vi.fn(async () => {
						if (result instanceof Error) throw result;
						return result as CoverageUploadResult;
					}),
				}
			: {}),
	} as unknown as Coverage;
}

async function run(
	coverage: Coverage | undefined,
	over: Partial<RunUploadCoverageInput> & { configured?: boolean; failures?: Record<string, string> } = {}
) {
	const { configured = true, failures, ...rest } = over;
	const lines: string[] = [];
	const report = await runUploadCoverage({
		loaded: loadedWith(configured ? { coverage: "codecov" } : {}),
		context: { repoRoot: "/repo" },
		uploads: UPLOADS,
		loader: fakeLoader(coverage ? { coverage } : {}, failures),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...rest,
	});
	return { report, text: lines.join("\n") };
}

describe("runUploadCoverage", () => {
	it("passes the groups, the repo root and allow-empty to the provider and prints a row per flag", async () => {
		const cov = provider({
			flags: [
				{ flag: "utils", outcome: "uploaded", files: 2, notes: ["a/lcov.info names no source file, left out"] },
				{ flag: "skills", outcome: "skipped", files: 0, notes: ["no coverage files"] },
			],
			uploaded: 1,
		});
		const { report, text } = await run(cov, { allowEmpty: true });
		expect(cov.upload).toHaveBeenCalledWith({
			uploads: [{ flag: "utils", files: ["utils/*/coverage/lcov.info"] }],
			repoRoot: "/repo",
			allowEmpty: true,
		});
		expect(report.status).toBe("ok");
		expect(report.uploaded).toBe(1);
		expect(text).toContain("utils");
		expect(text).toContain("uploaded 2 file(s)");
		expect(text).toContain("a/lcov.info names no source file, left out");
		expect(text).toContain("no coverage files");
	});

	it("leaves allowEmpty out when it was not asked for", async () => {
		const cov = provider({ flags: [], uploaded: 0 });
		await run(cov);
		expect((cov.upload as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).not.toHaveProperty("allowEmpty");
	});

	it("fails on a flag that failed, once, with its notes", async () => {
		const cov = provider({
			flags: [
				{ flag: "utils", outcome: "failed", files: 0, notes: ["Codecov rejected the utils upload 4 times: x"] },
			],
			uploaded: 0,
			problem: "Codecov rejected the utils upload 4 times: x",
		});
		const { report, text } = await run(cov);
		expect(report.status).toBe("fail");
		expect(report.rows).toHaveLength(1);
		expect(text).toContain("the upload failed");
		expect(text).toContain("rejected the utils upload 4 times");
	});

	it("fails when nothing was uploaded and the provider says it is a problem", async () => {
		const cov = provider({
			flags: [{ flag: "utils", outcome: "skipped", files: 0, notes: ["no coverage files"] }],
			uploaded: 0,
			problem: "No group has a coverage file, so nothing was uploaded.",
		});
		const { report, text } = await run(cov);
		expect(report.status).toBe("fail");
		expect(text).toContain("No group has a coverage file");
	});

	it("shows a skipped group that has no note as skipped", async () => {
		const { text } = await run(
			provider({ flags: [{ flag: "x", outcome: "skipped", files: 0, notes: [] }], uploaded: 0 })
		);
		expect(text).toContain("skipped");
	});

	it("turns a throw into a failing row, and the run is a failure", async () => {
		const { report, text } = await run(provider(new Error("No OIDC token available")));
		expect(report.status).toBe("fail");
		expect(text).toContain("No OIDC token available");
	});

	it("fails on malformed --uploads without loading a provider", async () => {
		const loader = fakeLoader({});
		const load = vi.spyOn(loader, "load");
		const { report, text } = await run(undefined, { uploads: "nope", loader });
		expect(report.status).toBe("fail");
		expect(text).toContain("JSON list of");
		expect(load).not.toHaveBeenCalled();
	});

	it("on --dry-run lists the groups and uploads nothing", async () => {
		const cov = provider({ flags: [], uploaded: 0 });
		const { report, text } = await run(cov, { context: { repoRoot: "/repo", dryRun: true } });
		expect(report.status).toBe("ok");
		expect(text).toContain("(dry-run)");
		expect(text).toContain("would upload files matching utils/*/coverage/lcov.info");
		expect(cov.upload).not.toHaveBeenCalled();
	});

	it("is a clear error when the config has no coverage provider", async () => {
		const { report, text } = await run(undefined, { configured: false });
		expect(report.status).toBe("fail");
		expect(text).toContain("no `coverage` provider");
	});

	it("says when the provider could not be loaded, with the reason", async () => {
		const { report, text } = await run(undefined, { failures: { coverage: "cannot find package" } });
		expect(report.status).toBe("fail");
		expect(text).toContain("not available");
		expect(text).toContain("cannot find package");
	});

	it("says when the provider could not be loaded and gave no reason", async () => {
		const { text } = await run(undefined, { loader: fakeLoader({}) });
		expect(text).toContain("not available");
		expect(text).not.toContain("(");
	});

	it("fails for a provider that cannot upload", async () => {
		const { report, text } = await run(provider(undefined, false));
		expect(report.status).toBe("fail");
		expect(text).toContain("the `codecov` provider cannot upload coverage");
	});
});
