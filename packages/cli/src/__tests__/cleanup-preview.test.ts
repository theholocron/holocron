import { beforeEach, describe, expect, it, vi } from "vitest";

import { runCleanupPreview } from "../commands/cleanup-preview.js";
import { resolveConfig } from "../config.js";
import type { DeploymentRecord, PullRequest } from "../capabilities/index.js";
import type { LoadedConfig } from "../load-config.js";
import { type PluginImporter, PluginLoader } from "../loader.js";

vi.mock("@inquirer/prompts", () => ({
	checkbox: vi.fn(),
}));

import { checkbox } from "@inquirer/prompts";
const mockCheckbox = vi.mocked(checkbox);

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return {
		resolved: resolveConfig(rawConfig),
		filepath: "/tmp/test/holocron.config.json",
	};
}

function makePlugin(name: string, caps: Record<string, unknown>) {
	return {
		createPlugin: (_opts: Record<string, unknown>) => ({
			name,
			capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

function makeLoaderWith(loaded: LoadedConfig, modules: Record<string, unknown>): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(
		loaded.resolved,
		{ repoRoot: "/tmp/test", repo: "theholocron/holocron" },
		importer as unknown as PluginImporter
	);
}

const PR_MERGED: PullRequest = {
	number: 42,
	title: "fix: something",
	state: "closed",
	merged: true,
	branch: "fix/something",
	url: "https://github.com/theholocron/holocron/pull/42",
};

const PR_OPEN: PullRequest = { ...PR_MERGED, state: "open", merged: false };

const DEPLOYMENT: DeploymentRecord = {
	id: "my-project:deploy-abc",
	url: "https://abc.my-project.pages.dev",
	branch: "my-project-pr-42",
	status: "ready",
	createdAt: "2026-08-28T00:00:00Z",
};

function makeSource(pr: PullRequest) {
	return {
		providerName: "github",
		key: "source" as const,
		getPullRequest: vi.fn().mockResolvedValue(pr),
	};
}

function makeDeployment(deployments: DeploymentRecord[] = [DEPLOYMENT]) {
	return {
		providerName: "cloudflare",
		key: "deployment" as const,
		listPreviewDeployments: vi.fn().mockResolvedValue(deployments),
		deletePreviewDeployments: vi.fn().mockResolvedValue(deployments.length),
	};
}

function makePlugins(pr: PullRequest, deployments?: DeploymentRecord[]) {
	const source = makeSource(pr);
	const deployment = makeDeployment(deployments);
	const loaded = loadedFrom({
		name: "demo",
		providers: { source: "github", deployment: "cloudflare" },
	});
	const loader = makeLoaderWith(loaded, {
		"@theholocron/holocron-plugin-github": makePlugin("github", { source }),
		"@theholocron/holocron-plugin-cloudflare": makePlugin("cloudflare", { deployment }),
	});
	return { loaded, loader, source, deployment };
}

describe("runCleanupPreview", () => {
	beforeEach(() => vi.clearAllMocks());
	it("throws when source capability is not configured", async () => {
		const loaded = loadedFrom({ name: "demo", providers: {} });
		const loader = makeLoaderWith(loaded, {});
		await expect(
			runCleanupPreview({ loaded, context: { repoRoot: "/tmp/test" }, prNumber: 42, project: "my-project", loader, print: () => {} })
		).rejects.toThrow(/source capability is not configured/);
	});

	it("throws when the source provider does not support getPullRequest", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { source: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("github", {
				source: { providerName: "github", key: "source" },
			}),
		});
		await expect(
			runCleanupPreview({ loaded, context: { repoRoot: "/tmp/test" }, prNumber: 42, project: "my-project", loader, print: () => {} })
		).rejects.toThrow(/does not support getPullRequest/);
	});

	it("throws when getPullRequest fails", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { source: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("github", {
				source: {
					providerName: "github",
					key: "source",
					getPullRequest: vi.fn().mockRejectedValue(new Error("not found")),
				},
			}),
		});
		await expect(
			runCleanupPreview({ loaded, context: { repoRoot: "/tmp/test" }, prNumber: 42, project: "my-project", loader, print: () => {} })
		).rejects.toThrow(/Failed to fetch PR #42/);
	});

	it("throws when deployment capability is not configured", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { source: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("github", { source: makeSource(PR_MERGED) }),
		});
		await expect(
			runCleanupPreview({ loaded, context: { repoRoot: "/tmp/test" }, prNumber: 42, project: "my-project", loader, print: () => {} })
		).rejects.toThrow(/deployment capability is not configured/);
	});

	it("throws when deployment provider does not support preview cleanup", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { source: "github", deployment: "cloudflare" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("github", { source: makeSource(PR_MERGED) }),
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cloudflare", {
				deployment: { providerName: "cloudflare", key: "deployment" },
			}),
		});
		await expect(
			runCleanupPreview({ loaded, context: { repoRoot: "/tmp/test" }, prNumber: 42, project: "my-project", loader, print: () => {} })
		).rejects.toThrow(/does not support preview cleanup/);
	});

	it("returns status=none when no deployments are found", async () => {
		const { loaded, loader } = makePlugins(PR_MERGED, []);
		const report = await runCleanupPreview({
			loaded,
			context: { repoRoot: "/tmp/test" },
			prNumber: 42,
			project: "my-project",
			loader,
			print: () => {},
		});
		expect(report.status).toBe("none");
		expect(report.found).toBe(0);
		expect(report.deleted).toBe(0);
	});

	it("pre-selects all deployments for a closed/merged PR", async () => {
		mockCheckbox.mockResolvedValueOnce([DEPLOYMENT.id]);
		const { loaded, loader } = makePlugins(PR_MERGED);
		await runCleanupPreview({
			loaded,
			context: { repoRoot: "/tmp/test" },
			prNumber: 42,
			project: "my-project",
			loader,
			print: () => {},
		});
		const choices = mockCheckbox.mock.calls[0]?.[0]?.choices as Array<{ checked: boolean }>;
		expect(choices.every((c) => c.checked)).toBe(true);
	});

	it("pre-selects nothing for an open PR", async () => {
		mockCheckbox.mockResolvedValueOnce([]);
		const { loaded, loader } = makePlugins(PR_OPEN);
		await runCleanupPreview({
			loaded,
			context: { repoRoot: "/tmp/test" },
			prNumber: 42,
			project: "my-project",
			loader,
			print: () => {},
		});
		const choices = mockCheckbox.mock.calls[0]?.[0]?.choices as Array<{ checked: boolean }>;
		expect(choices.every((c) => !c.checked)).toBe(true);
	});

	it("deletes selected deployments and returns status=ok", async () => {
		mockCheckbox.mockResolvedValueOnce([DEPLOYMENT.id]);
		const { loaded, loader, deployment } = makePlugins(PR_MERGED);
		const report = await runCleanupPreview({
			loaded,
			context: { repoRoot: "/tmp/test" },
			prNumber: 42,
			project: "my-project",
			loader,
			print: () => {},
		});
		expect(deployment.deletePreviewDeployments).toHaveBeenCalledWith("my-project", [DEPLOYMENT.id]);
		expect(report.status).toBe("ok");
		expect(report.deleted).toBe(1);
	});

	it("returns status=aborted when nothing is selected", async () => {
		mockCheckbox.mockResolvedValueOnce([]);
		const { loaded, loader } = makePlugins(PR_MERGED);
		const report = await runCleanupPreview({
			loaded,
			context: { repoRoot: "/tmp/test" },
			prNumber: 42,
			project: "my-project",
			loader,
			print: () => {},
		});
		expect(report.status).toBe("aborted");
		expect(report.deleted).toBe(0);
	});

	it("returns status=aborted when checkbox throws (Ctrl-C)", async () => {
		mockCheckbox.mockRejectedValueOnce(new Error("User force closed"));
		const { loaded, loader } = makePlugins(PR_MERGED);
		const report = await runCleanupPreview({
			loaded,
			context: { repoRoot: "/tmp/test" },
			prNumber: 42,
			project: "my-project",
			loader,
			print: () => {},
		});
		expect(report.status).toBe("aborted");
	});

	it("returns status=fail when deletePreviewDeployments throws", async () => {
		mockCheckbox.mockResolvedValueOnce([DEPLOYMENT.id]);
		const { loaded, loader } = makePlugins(PR_MERGED);
		const { deployment } = makePlugins(PR_MERGED);
		deployment.deletePreviewDeployments.mockRejectedValueOnce(new Error("API error"));
		const failLoader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("github", { source: makeSource(PR_MERGED) }),
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cloudflare", { deployment }),
		});
		const report = await runCleanupPreview({
			loaded,
			context: { repoRoot: "/tmp/test" },
			prNumber: 42,
			project: "my-project",
			loader: failLoader,
			print: () => {},
		});
		expect(report.status).toBe("fail");
		expect(report.message).toContain("API error");
	});

	it("uses --repo override when looking up the PR and deriving the branch alias", async () => {
		mockCheckbox.mockResolvedValueOnce([]);
		const { loaded, loader, source } = makePlugins(PR_MERGED);
		const report = await runCleanupPreview({
			loaded,
			context: { repoRoot: "/tmp/test" },
			prNumber: 42,
			project: "my-project",
			repo: "theholocron/clients",
			loader,
			print: () => {},
		});
		expect(source.getPullRequest).toHaveBeenCalledWith(42, "theholocron/clients");
		expect(report.branch).toBe("clients-pr-42");
	});
});
