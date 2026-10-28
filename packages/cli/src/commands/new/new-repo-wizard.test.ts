import { describe, expect, it } from "vitest";

import { askNewRepoAnswers, type WizardPrompts } from "./new-repo-wizard.js";

/** Stand-in prompts: each question is answered by the first answer whose key is in its message; every question is recorded. */
function prompts(answers: Record<string, string>) {
	const asked: string[] = [];
	const answer = (options: { message: string; default?: string; validate?: (v: string) => unknown }) => {
		asked.push(options.message);
		const key = Object.keys(answers).find((k) => options.message.includes(k));
		return Promise.resolve(key === undefined ? (options.default ?? "") : answers[key]!);
	};
	return { asked, prompts: { input: answer, select: answer } as unknown as WizardPrompts };
}

const none = {
	type: undefined,
	name: undefined,
	description: undefined,
	homepage: undefined,
	vault: undefined,
	deployment: undefined,
	agent: undefined,
	"runtime-environment": undefined,
	topics: undefined,
	protection: undefined,
	"open-source": undefined,
	"uses-external-packages": undefined,
	skills: undefined,
	"is-template": undefined,
};

describe("askNewRepoAnswers", () => {
	it("asks for everything when nothing was supplied, and reads the answers", async () => {
		const { asked, prompts: p } = prompts({
			"Template type": "cli",
			"Repo name": "  my-tool  ",
			"Short description": "does things",
			Homepage: "  https://x.test  ",
			"Runtime environment": "universal",
			"Vault provider": "none",
			"Deployment provider": "vercel",
			"AI agent": "claude",
			Topics: "a, b",
			"Branch protection": "balanced",
			"Open source": "no",
			"external APIs": "yes",
			"Agent skills": "git-safety",
		});
		const answers = await askNewRepoAnswers(none as never, p);
		expect(answers).toMatchObject({
			type: "cli",
			name: "my-tool",
			description: "does things",
			homepage: "https://x.test",
			runtimeEnvironment: "universal",
			vaultProvider: "none",
			deploymentProvider: "vercel",
			agent: "claude",
			topics: ["a", "b"],
			protection: "balanced",
			openSource: false,
			usesExternalPackages: true,
			skills: ["git-safety"],
		});
		expect(asked).toHaveLength(13);
	});

	it("asks for nothing that was supplied as an argument", async () => {
		const { asked, prompts: p } = prompts({});
		const answers = await askNewRepoAnswers(
			{
				type: "node",
				name: "lib",
				description: "",
				homepage: "",
				vault: "none",
				deployment: "none",
				agent: "none",
				"runtime-environment": "node",
				topics: "x",
				protection: "strict",
				"open-source": true,
				"uses-external-packages": false,
				skills: "s",
				"is-template": true,
			} as never,
			p
		);
		expect(asked).toEqual([]);
		expect(answers).toMatchObject({
			type: "node",
			name: "lib",
			description: "",
			homepage: "",
			topics: ["x"],
			openSource: true,
			usesExternalPackages: false,
			skills: ["s"],
			isTemplate: true,
		});
	});

	it("leaves the homepage out when the answer is blank, and defaults the runtime to none for a base repo", async () => {
		const { prompts: p } = prompts({ Homepage: "   " });
		const answers = await askNewRepoAnswers({ ...none, type: "base", name: "docs" } as never, p);
		expect(answers.homepage).toBeUndefined();
		expect(answers.runtimeEnvironment).toBe("none");
	});

	it("asks for a Doppler project and config when Doppler is the vault", async () => {
		const { asked, prompts: p } = prompts({ "Doppler project": "proj", "Doppler config": "stg" });
		const answers = await askNewRepoAnswers({ ...none, type: "node", name: "lib", vault: "doppler" } as never, p);
		expect(asked).toEqual(expect.arrayContaining(["Doppler project name:", "Doppler config:"]));
		expect(answers).toMatchObject({ vaultProject: "proj", vaultConfig: "stg" });
	});

	it("asks for a 1Password vault or Infisical project name, named for the provider", async () => {
		for (const [vault, label] of [
			["1password", "1Password vault name:"],
			["infisical", "Infisical project name:"],
		] as const) {
			const { asked, prompts: p } = prompts({ [label]: "the-vault" });
			const answers = await askNewRepoAnswers({ ...none, type: "node", name: "lib", vault } as never, p);
			expect(asked).toContain(label);
			expect(answers.vaultProject).toBe("the-vault");
			expect(answers.vaultConfig).toBeUndefined();
		}
	});
});
