import type { AggregateCheckRun, AggregateCommitStatus } from "../evaluate-aggregate/evaluate-aggregate.type.js";
import type { AggregateApi, AggregateWrite } from "./post-aggregate.type.js";

/** An in-memory {@link AggregateApi} for tests: it keeps the runs, records the writes and can be told to misbehave. */
export class FakeAggregateApi implements AggregateApi {
	runs: AggregateCheckRun[] = [];
	commitStatuses: AggregateCommitStatus[] = [];
	writes: Array<{ id: number | null; write: AggregateWrite }> = [];
	nextId = 100;
	/** Refuse to update a completed run, as GitHub may. */
	refuseReopen = false;
	/** Called after each read, to change the state under the caller. */
	onList?: (reads: number) => void;
	/** Runs added right after the first create, as a racing delivery would. */
	raceOnCreate: AggregateCheckRun[] = [];
	private reads = 0;

	async listCheckRuns(): Promise<AggregateCheckRun[]> {
		this.reads += 1;
		this.onList?.(this.reads);
		return this.runs.map((run) => ({ ...run }));
	}

	async listCommitStatuses(): Promise<AggregateCommitStatus[]> {
		return this.commitStatuses;
	}

	async createCheckRun(_sha: string, name: string, write: AggregateWrite): Promise<number> {
		const id = this.nextId++;
		this.runs.push({
			id,
			name,
			status: write.status,
			conclusion: write.conclusion ?? null,
			startedAt: write.startedAt as string, // a create always carries the start
			url: null,
		});
		this.runs.push(...this.raceOnCreate);
		this.raceOnCreate = [];
		this.writes.push({ id, write });
		return id;
	}

	async updateCheckRun(id: number, write: AggregateWrite): Promise<void> {
		const run = this.runs.find((candidate) => candidate.id === id) as AggregateCheckRun; // the tests update runs they made
		if (this.refuseReopen && run.status === "completed") {
			throw new Error("a completed check run cannot be reopened");
		}
		run.status = write.status;
		run.conclusion = write.conclusion as AggregateCheckRun["conclusion"];
		this.writes.push({ id, write });
	}
}
