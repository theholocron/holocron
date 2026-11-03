import type { Logger } from "@theholocron/observability/core";

import type { FileIdentity, GitIgnoreState, ShredOutcome } from "../../auth/index.js";
import type { ConvertedApp } from "../convert-app-manifest/index.js";
import type { AppManifestServer, ServeAppManifestInput } from "../serve-app-manifest/index.js";

/** Input for {@link runGithubAppCreate}. */
export interface RunGithubAppCreateInput {
	/** The directory the manifest file and the credentials file are relative to. */
	dir: string;
	/** The manifest file: `default_permissions`, `default_events` and optionally `description`, `url`, `public`. */
	manifest: string;
	/** The App's name, unique across all of GitHub. */
	name: string;
	/** The `https` URL GitHub delivers webhooks to (the tunnel's address and `/api/webhook`). */
	webhookUrl: string;
	/** The organization to create the App under. Without one it is created under the account that is signed in. */
	org?: string | undefined;
	/** The variable the webhook secret is written as. Defaults to `SENTINEL_WEBHOOK_SECRET`. */
	webhookSecretVar?: string | undefined;
	/** The private file for the credentials, relative to `dir`. Defaults to `.credentials`. */
	file?: string | undefined;
	/** Replace the file if it is already there. Without it an existing file is never overwritten. */
	force?: boolean | undefined;
	/** Leave the file in place instead of deleting it once the import is done. */
	keep?: boolean | undefined;
	/** Whether there is a terminal to ask on. Without one the file is left and the command says to delete it. */
	interactive?: boolean | undefined;
	/** Reads a text file. Defaults to the filesystem. */
	readFile?: ((path: string) => string) | undefined;
	/** Whether a path exists. Defaults to the filesystem. */
	exists?: ((path: string) => boolean) | undefined;
	/** What git says about the path. Defaults to asking git. */
	isIgnored?: ((path: string) => GitIgnoreState) | undefined;
	/** The platform, for refusing the file where its mode means nothing. Defaults to the running one. */
	platform?: string | undefined;
	/** Writes the private file and says which file it is. Defaults to `writeCredentialsFile`. */
	writeFile?: ((path: string, text: string, force: boolean) => FileIdentity) | undefined;
	/** Overwrites and removes the file it was written as. Defaults to `shredFile`. */
	shred?: ((path: string, identity: FileIdentity) => ShredOutcome) | undefined;
	/** Waits for the user to finish importing. Defaults to waiting for Enter on the terminal. */
	waitForImport?: ((message: string) => Promise<unknown>) | undefined;
	/** Opens an address in the browser. Defaults to the platform's opener. */
	openUrl?: ((url: string) => void) | undefined;
	/** Starts the one-shot local server. Defaults to {@link serveAppManifest}. */
	serve?: ((input: ServeAppManifestInput) => Promise<AppManifestServer>) | undefined;
	/** Exchanges the code for the App. Defaults to {@link convertAppManifest}. */
	convert?: ((code: string) => Promise<ConvertedApp>) | undefined;
	/** The nonce GitHub must echo back. Defaults to a random one. */
	state?: string | undefined;
	/** Where the names and paths go (never a value). Defaults to stderr. */
	print?: ((line: string) => void) | undefined;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger | undefined;
}

/** What `holocron github-app create` did. Names and paths only; never a value. */
export interface GithubAppCreateReport {
	/** `fail` when the App was not created or its credentials not kept as asked, otherwise `ok`. */
	status: "ok" | "fail";
	/** The App's URL name, once it exists. */
	slug?: string;
	/** The App's id, once it exists. */
	appId?: number;
	/** The file the credentials were written to. */
	file?: string;
}
