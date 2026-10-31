import { describe, expect, it } from "vitest";

import { resolveConfig } from "../../config/index.js";
import type { NotificationsLayout } from "../../plugin/index.js";
import { layoutSecretNames } from "../notifications-channel-add/index.js";
import { expectedSecrets } from "./expected-secrets.js";

type Raw = Parameters<typeof resolveConfig>[0];
const configOf = (extra: Record<string, unknown>) => resolveConfig({ name: "demo", providers: {}, ...extra } as Raw);

const layout: NotificationsLayout = {
	categories: [
		{
			name: "Ops",
			channels: [
				{ name: "sync", webhook: true },
				{ name: "alerts", webhook: { secret: "CUSTOM_ALERTS" } },
				{ name: "quiet" },
				{ name: "off", webhook: false },
			],
		},
		{ name: "Empty" },
	],
	roles: [{ name: "alert", secret: "HOLOCRON_NOTIFY_ALERT_ROLE" }, { name: "plain" }],
};

describe("layoutSecretNames", () => {
	it("names each channel's webhook secret and each role's secret, in declaration order", () => {
		expect(layoutSecretNames(layout)).toEqual([
			"HOLOCRON_NOTIFY_WEBHOOK_SYNC",
			"CUSTOM_ALERTS",
			"HOLOCRON_NOTIFY_ALERT_ROLE",
		]);
	});

	it("is empty for a layout that fills nothing", () => {
		expect(layoutSecretNames({})).toEqual([]);
	});
});

describe("expectedSecrets", () => {
	it("is empty when the config expects nothing", () => {
		expect(expectedSecrets(configOf({}), [])).toEqual({ repo: [], org: [], environments: {} });
	});

	it("takes repo.secrets as declared", () => {
		const config = configOf({
			repo: { secrets: { repo: ["TURBO_TOKEN"], org: ["NPM_TOKEN"], environments: { production: ["DB_URL"] } } },
		});
		expect(expectedSecrets(config, [])).toEqual({
			repo: ["TURBO_TOKEN"],
			org: ["NPM_TOKEN"],
			environments: { production: ["DB_URL"] },
		});
	});

	it("adds the layouts' secrets to the organization's", () => {
		const config = configOf({ repo: { secrets: { org: ["NPM_TOKEN"] } } });
		expect(expectedSecrets(config, [layout]).org).toEqual([
			"NPM_TOKEN",
			"HOLOCRON_NOTIFY_WEBHOOK_SYNC",
			"CUSTOM_ALERTS",
			"HOLOCRON_NOTIFY_ALERT_ROLE",
		]);
	});

	it("adds a Chromatic token per project of the visual regression task: the bare one for default or none", () => {
		const config = configOf({
			tasks: [
				"verification.unitTests",
				{
					name: "verification.visualRegression",
					with: {
						"chromatic-projects": [
							{ tokenName: "web", workingDir: "apps/web" },
							{ tokenName: "default", workingDir: "." },
							{ workingDir: "x" },
						],
					},
				},
				{ name: "verification.visualRegression" },
				{ name: "delivery.deploy", with: { "chromatic-projects": [{ tokenName: "no", workingDir: "." }] } },
			],
		});
		expect(expectedSecrets(config, []).repo).toEqual(["CHROMATIC_PROJECT_TOKEN_WEB", "CHROMATIC_PROJECT_TOKEN"]);
	});

	it("counts names that differ only in case once, keeping the first spelling", () => {
		const config = configOf({
			repo: { secrets: { repo: ["Turbo_Token", "TURBO_TOKEN"], environments: { qa: ["a", "A"] } } },
		});
		expect(expectedSecrets(config, [])).toMatchObject({ repo: ["Turbo_Token"], environments: { qa: ["a"] } });
	});
});
