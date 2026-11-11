/** One Environment name to look for, and what a miss means. */
export interface EnvironmentCandidate {
	/** The Environment's name, as the provider is asked for it. */
	name: string;
	/** Absent is normal and says nothing (the `- local` overrides). Otherwise a miss is reported by name. */
	optional: boolean;
	/** From the migration fallback (`legacy-environments/`), not from the layers. Delete with that folder. */
	legacy: boolean;
}
