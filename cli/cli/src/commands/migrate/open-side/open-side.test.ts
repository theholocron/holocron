import { describe, expect, it, vi } from "vitest";

import { ConfigError } from "../../../config/index.js";
import { fakeIssues, fakeLoader, loadedWith } from "../testing.js";
import { openSide } from "./open-side.js";

const context = { repoRoot: "/x" };

describe("openSide", () => {
	it("lays the endpoint's options over the config's own entry for the same provider", async () => {
		const seen: unknown[] = [];
		const issues = fakeIssues("linear");
		const side = await openSide({
			loaded: loadedWith({ issues: ["linear", { team: "ENG", states: { inReview: "QA" } }] }),
			context,
			endpoint: { provider: "linear", options: { team: "OPS" } },
			capabilities: ["issues"],
			makeLoader: (resolved) => {
				seen.push(resolved.providers.issues);
				return fakeLoader({ issues });
			},
		});
		expect(side).toEqual({ ok: true, provider: "linear", issues });
		expect(seen[0]).toMatchObject({
			cardinality: "single",
			tuple: { provider: "linear", options: { team: "OPS", states: { inReview: "QA" } } },
		});
	});

	it("ignores the config's entry for a different provider", async () => {
		let options: unknown;
		await openSide({
			loaded: loadedWith({ issues: ["github", { repo: "o/r" }] }),
			context,
			endpoint: { provider: "linear", options: { team: "ENG" } },
			capabilities: ["issues"],
			makeLoader: (resolved) => {
				options = (resolved.providers.issues as { tuple: { options: unknown } }).tuple.options;
				return fakeLoader({ issues: fakeIssues("linear") });
			},
		});
		expect(options).toEqual({ team: "ENG" });
	});

	it("loads projects as well when asked", async () => {
		const side = await openSide({
			loaded: loadedWith(),
			context,
			endpoint: { provider: "github", options: {} },
			capabilities: ["issues", "projects"],
			makeLoader: () => fakeLoader({ issues: "i", projects: "p" }),
		});
		expect(side).toMatchObject({ ok: true, issues: "i", projects: "p" });
	});

	it("says why a capability did not load, or only that it is missing", async () => {
		const failed = await openSide({
			loaded: loadedWith(),
			context,
			endpoint: { provider: "linear", options: {} },
			capabilities: ["issues"],
			makeLoader: () => fakeLoader({}, { issues: "no token" }),
		});
		expect(failed).toEqual({
			ok: false,
			reason: expect.stringMatching(/`issues` capability of `linear` is not available \(.*no token/),
		});
		const missing = await openSide({
			loaded: loadedWith(),
			context,
			endpoint: { provider: "linear", options: {} },
			capabilities: ["projects"],
			makeLoader: () => fakeLoader({}),
		});
		expect(missing).toEqual({ ok: false, reason: "the `projects` capability of `linear` is not available" });
	});

	it("builds a real loader when none is given, and fails when no package resolves", async () => {
		const load = vi.fn();
		void load;
		const err = await openSide({
			loaded: loadedWith(),
			context: { repoRoot: "/nonexistent" },
			endpoint: { provider: "no-such-provider-xyz", options: {} },
			capabilities: ["issues"],
		}).catch((e: unknown) => e);
		// Either a clean `ok: false` or the workspace error the commands print; never a crash.
		expect(err instanceof Error || (err as { ok?: boolean }).ok === false).toBe(true);
		expect(err).not.toBeInstanceOf(ConfigError);
	});
});
