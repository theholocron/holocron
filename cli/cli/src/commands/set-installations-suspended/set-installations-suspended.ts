import { listAppInstallations, suspendAppInstallation, unsuspendAppInstallation } from "@theholocron/github-client";

import type {
	InstallationApi,
	SetInstallationsSuspendedInput,
	SetInstallationsSuspendedResult,
} from "./set-installations-suspended.type.js";

const GITHUB: InstallationApi = {
	list: (creds) => listAppInstallations(creds),
	suspend: (creds, id) => suspendAppInstallation(creds, id),
	unsuspend: (creds, id) => unsuspendAppInstallation(creds, id),
};

/**
 * Suspends or unsuspends every installation of a GitHub App with the App's own JWT: `holocron dev`'s switch for the
 * development App (`dev.suspendWhenIdle`). A suspended installation is sent no
 * webhooks, so nothing fails against a tunnel that is down. An installation already in the wanted state is not called, so
 * a second run changes nothing. Stops at the first refusal, leaving the others as they were.
 */
export async function setInstallationsSuspended(
	input: SetInstallationsSuspendedInput
): Promise<SetInstallationsSuspendedResult> {
	const api = input.api ?? GITHUB;
	const installations = await api.list(input.creds);
	let changed = 0;
	for (const installation of installations) {
		if (installation.suspended === input.suspended) continue;
		await (input.suspended ? api.suspend : api.unsuspend)(input.creds, installation.id);
		changed++;
	}
	return { total: installations.length, changed };
}
