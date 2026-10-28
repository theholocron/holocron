export type PublishPrint = (line: string) => void;

export type PublishExecResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type PublishStatus = "ok" | "fail" | "dry-run";

export interface PublishReport {
	status: PublishStatus;
	message?: string;
	/** Packages that the publish step targeted. */
	packageNames: readonly string[];
}
