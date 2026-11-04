/** What was given on the command line for `holocron dev`. Every field is optional: the config fills in the rest. */
export interface DevFlags {
	/** `--environment`. */
	environment?: string | undefined;
	/** `--name`. */
	name?: string | undefined;
	/** `--hostname`. */
	hostname?: string | undefined;
	/** `--port`. */
	port?: number | undefined;
	/** The command after `--`. */
	command?: string[] | undefined;
}

/** Everything `holocron dev` needs, from the flags and the `dev` block of the config. */
export interface ResolvedDevOptions {
	/** The vault environment whose variables the application runs with. */
	environment: string;
	/** The tunnel's name. */
	name: string;
	/** The public hostname the tunnel serves. */
	hostname: string;
	/** The port the application listens on and the tunnel sends requests to. */
	port: number;
	/** The application's command and arguments. */
	command: string[];
}
