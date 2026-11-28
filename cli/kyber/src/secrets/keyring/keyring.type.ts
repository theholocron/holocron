/** One stored secret, as the OS keyring binding hands it out. */
export interface KeyringEntry {
	/** Store or replace the secret. Throws when the platform has no credential store. */
	setPassword(password: string): void;
	/** The secret, or `null` when nothing is stored. Throws when the platform has no credential store. */
	getPassword(): string | null;
	/** Remove the secret, and say whether there was one. Throws when the platform has no credential store. */
	deletePassword(): boolean;
}

/** The part of `@napi-rs/keyring` that {@link createKeyring} uses, so a test can stand in for the OS. */
export interface KeyringBinding {
	/** A handle on one secret: a service (the scope) and an account (the name within it). */
	Entry: new (service: string, account: string) => KeyringEntry;
	/** Every secret stored under `service`. Throws when the platform has no credential store. */
	findCredentials(service: string): Array<{ account: string }>;
}

/** What {@link createKeyring} needs. */
export interface KeyringOptions {
	/**
	 * The scope every secret is stored under, usually a reverse-DNS name (`com.example.tool`), so one tool's secrets
	 * do not mix with another's.
	 */
	service: string;
	/**
	 * The OS keyring binding. Default: `@napi-rs/keyring`, loaded the first time it is needed; a keyring that cannot be
	 * loaded behaves like one the platform does not support.
	 */
	binding?: KeyringBinding | null;
}

/** A tool's secrets in the OS keyring. Every method is best-effort: where the keyring cannot be used it answers `null`, `false` or an empty list and never throws. */
export interface Keyring {
	/**
	 * The secret stored for `account`, or `null` for both "not stored" and "keyring unavailable". The answer, a miss
	 * included, is remembered for the life of the process, so the keyring (which can prompt on every read) is asked once
	 * per account.
	 */
	get(account: string): string | null;
	/** Store or replace the secret for `account`. `true` on success, `false` when the keyring is unavailable. */
	set(account: string, secret: string): boolean;
	/** Remove the secret for `account`. `true` when one was removed, `false` when there was none or the keyring is unavailable. */
	delete(account: string): boolean;
	/** The accounts that have a secret under this service. */
	list(): string[];
	/** Whether the OS keyring can be used at all, for a caller that must tell an outage from an empty keyring. */
	isAvailable(): boolean;
	/** Forget what `get` remembered, so the next read asks the keyring again. For a test, or after the keyring was changed from outside the process. */
	clearCache(): void;
}
