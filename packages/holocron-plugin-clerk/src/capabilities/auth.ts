/**
 * `auth` capability for Clerk.
 *
 * Ported from rando-id/rando.id `adapters/clerk-cli.ts`, swapped from
 * shell-out (`npx clerk@latest api ...`) to direct REST against
 * api.clerk.com/v1.
 *
 * Surface mirrors the Rando shape:
 *
 *  - `whoami` — `GET /users/count`. Cheap reachability probe; the user
 *    count doubles as a sanity signal for the operator.
 *  - `ensureWebhookApp` — `POST /webhooks/svix`. Idempotent — if a Svix
 *    app already exists, the API returns an error containing "already";
 *    we suppress it and return `{ alreadyExists: true }`.
 *  - `getWebhookDashboardUrl` — `POST /webhooks/svix_url`. Returns a
 *    one-time admin login URL to Svix's dashboard so the operator can
 *    finish endpoint config there.
 *  - `createUser` — `POST /users`. Used for seeding test users into
 *    staging without touching the dashboard.
 *  - `describe` — declares the runtime env keys a Clerk-using app needs.
 *
 * The configured secret key (`sk_test_*` vs `sk_live_*`) decides which
 * Clerk instance (Development vs Production) every call hits — there's
 * no per-call instance switch.
 */

import type {
	Auth,
	AuthDescription,
	AuthIdentity,
	AuthUser,
	CreateAuthUserInput,
	WebhookDashboardInfo,
} from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import type { ClerkClient } from "../rest.js";

export type ClerkAuthOptions = Record<string, never>;

export class ClerkAuth implements Auth {
	readonly key = "auth" as const;
	readonly providerName = "clerk";

	constructor(
		private readonly client: ClerkClient,
		_opts: ClerkAuthOptions = {}
	) {}

	// ── describe ────────────────────────────────────────────────────────

	async describe(): Promise<AuthDescription> {
		return {
			provider: "clerk",
			envKeys: ["CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"],
		};
	}

	// ── whoami ──────────────────────────────────────────────────────────

	async whoami(): Promise<AuthIdentity> {
		const result = await this.client.users.count();
		return {
			provider: "clerk",
			details: { userCount: result.total_count },
		};
	}

	// ── webhook (Svix) ──────────────────────────────────────────────────

	async ensureWebhookApp(): Promise<{ alreadyExists: boolean }> {
		try {
			await this.client.webhooks.ensureSvixApp();
			return { alreadyExists: false };
		} catch (err) {
			if (err instanceof ProviderApiError && isAlreadyExistsError(err)) {
				return { alreadyExists: true };
			}
			throw err;
		}
	}

	async getWebhookDashboardUrl(): Promise<WebhookDashboardInfo> {
		const body = await this.client.webhooks.getSvixUrl();
		const url = body.url ?? body.svix_url;
		if (!url) {
			throw new ProviderApiError("Clerk POST /webhooks/svix_url returned 200 but no `url` field", 500, undefined);
		}
		return { url };
	}

	// ── users ───────────────────────────────────────────────────────────

	async createUser(input: CreateAuthUserInput): Promise<AuthUser> {
		const user = await this.client.users.create({
			email_address: [input.email],
			password: input.password,
			...(input.firstName ? { first_name: input.firstName } : {}),
			...(input.lastName ? { last_name: input.lastName } : {}),
		});
		const email = user.email_addresses[0]?.email_address ?? input.email;
		return { id: user.id, email };
	}
}

/**
 * Clerk returns a 4xx with `errors[0].code` of `you_already_have_a_svix_app`
 * (or text containing "already exists") when the Svix app already exists.
 * Treat that as a successful no-op so `ensureWebhookApp` is idempotent.
 */
function isAlreadyExistsError(err: ProviderApiError): boolean {
	if (typeof err.details === "string") {
		const lower = err.details.toLowerCase();
		return lower.includes("already") || lower.includes("exists");
	}
	return false;
}
