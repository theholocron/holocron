export interface SkillLockEntry {
	source: string;
	sourceType: "github";
	skillPath: string;
	computedHash?: string;
}

export interface SkillsLock {
	version: number;
	skills: Record<string, SkillLockEntry>;
}
