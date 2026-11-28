import { describe, expect, it } from "vitest";

import { appInstance } from "./app-instance.js";

const preview = { project: "sentinel-preview", domain: "sentinel-preview.example" };

describe("appInstance", () => {
	it("sends production to the project named like the app, as its production target", () => {
		expect(appInstance("sentinel", { domain: "sentinel.example" }, "production")).toEqual({
			project: "sentinel",
			domain: "sentinel.example",
			production: true,
			omitCrons: false,
		});
	});

	it("leaves the domain out when the config names none", () => {
		expect(appInstance("sentinel", {}, "production")).toEqual({
			project: "sentinel",
			production: true,
			omitCrons: false,
		});
	});

	it("sends preview to the instance the app declares: its project and domain, its own production, no crons", () => {
		expect(appInstance("sentinel", { domain: "sentinel.example", instances: { preview } }, "preview")).toEqual({
			project: "sentinel-preview",
			domain: "sentinel-preview.example",
			production: true,
			omitCrons: true,
		});
	});

	it("keeps today's meaning of preview, a Vercel preview deployment of the one project, with no instance declared", () => {
		expect(appInstance("sentinel", { domain: "sentinel.example" }, "preview")).toEqual({
			project: "sentinel",
			domain: "sentinel.example",
			production: false,
			omitCrons: false,
		});
		expect(appInstance("sentinel", { instances: {} }, "preview").production).toBe(false);
	});

	it("does not read a preview instance for production", () => {
		expect(appInstance("sentinel", { instances: { preview } }, "production").project).toBe("sentinel");
	});

	it("leaves the instance's domain out when it names none", () => {
		expect(appInstance("sentinel", { instances: { preview: { project: "p" } } }, "preview")).toEqual({
			project: "p",
			production: true,
			omitCrons: true,
		});
	});

	it.each([null, "x", 3, {}, { project: "" }, { project: 4 }])("refuses a preview instance of %j", (value) => {
		expect(() => appInstance("sentinel", { instances: { preview: value } }, "preview")).toThrow(
			/instances\.preview/
		);
	});
});
