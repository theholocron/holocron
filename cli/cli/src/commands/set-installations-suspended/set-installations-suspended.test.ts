import type { GitHubAppInstallation } from "@theholocron/github-client";
import { afterEach, describe, expect, it, vi } from "vitest";

const github = vi.hoisted(() => ({
	listAppInstallations: vi.fn(),
	suspendAppInstallation: vi.fn(async () => {}),
	unsuspendAppInstallation: vi.fn(async () => {}),
}));
vi.mock("@theholocron/github-client", async (importOriginal) => ({
	...(await importOriginal<typeof import("@theholocron/github-client")>()),
	...github,
}));

import { setInstallationsSuspended } from "./set-installations-suspended.js";

const creds = { appId: "1", privateKey: "k" };
const installation = (id: number, suspended: boolean): GitHubAppInstallation => ({
	id,
	account: null,
	permissions: {},
	events: [],
	suspended,
});
const fakeApi = (installations: GitHubAppInstallation[]) => ({
	list: vi.fn(async () => installations),
	suspend: vi.fn(async () => {}),
	unsuspend: vi.fn(async () => {}),
});

afterEach(() => vi.clearAllMocks());

describe("setInstallationsSuspended", () => {
	it("suspends only the installations that are active", async () => {
		const api = fakeApi([installation(1, false), installation(2, true)]);
		expect(await setInstallationsSuspended({ creds, suspended: true, api })).toEqual({ total: 2, changed: 1 });
		expect(api.suspend).toHaveBeenCalledTimes(1);
		expect(api.suspend).toHaveBeenCalledWith(creds, 1);
		expect(api.unsuspend).not.toHaveBeenCalled();
	});

	it("unsuspends only the installations that are suspended, and changes nothing a second time", async () => {
		const api = fakeApi([installation(1, false), installation(2, true)]);
		expect(await setInstallationsSuspended({ creds, suspended: false, api })).toEqual({ total: 2, changed: 1 });
		expect(api.unsuspend).toHaveBeenCalledWith(creds, 2);
		const settled = fakeApi([installation(1, false)]);
		expect(await setInstallationsSuspended({ creds, suspended: false, api: settled })).toEqual({
			total: 1,
			changed: 0,
		});
		expect(settled.unsuspend).not.toHaveBeenCalled();
	});

	it("stops at the first refusal", async () => {
		const api = fakeApi([installation(1, false), installation(2, false)]);
		api.suspend.mockRejectedValueOnce(new Error("403"));
		await expect(setInstallationsSuspended({ creds, suspended: true, api })).rejects.toThrow("403");
		expect(api.suspend).toHaveBeenCalledTimes(1);
	});

	it("defaults to the GitHub client's calls", async () => {
		github.listAppInstallations.mockResolvedValue([installation(5, false), installation(6, true)]);
		expect(await setInstallationsSuspended({ creds, suspended: true })).toEqual({ total: 2, changed: 1 });
		expect(github.suspendAppInstallation).toHaveBeenCalledWith(creds, 5);
		await setInstallationsSuspended({ creds, suspended: false });
		expect(github.unsuspendAppInstallation).toHaveBeenCalledWith(creds, 6);
	});
});
