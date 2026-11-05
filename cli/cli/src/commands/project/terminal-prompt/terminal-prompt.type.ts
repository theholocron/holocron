/** How a project command asks a person something. Injected so a test needs no terminal. */
export interface ProjectPrompt {
	/** Whether there is a person to ask (stdin is a terminal). When false, `confirm` and `select` must not be called. */
	interactive: boolean;
	/** A yes/no question. */
	confirm(message: string, defaultValue: boolean): Promise<boolean>;
	/** Pick one of several values. */
	select(message: string, choices: string[]): Promise<string>;
}
