import type { CheckRow } from "@theholocron/kyber/ui";

import type { Workers } from "../../plugin/index.js";
import type { DeclaredWorker } from "./doctor-workers.type.js";
import { readFailureRow } from "./read-failure.js";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const row = (
	id: string,
	title: string,
	status: CheckRow["status"],
	detail: string,
	problems: string[] = []
): CheckRow => ({ id, title, status, detail, problems });

/**
 * The rows for one declared Worker: its script is deployed and has the route for its host, it has the bindings it
 * needs (names only, a value is never read), and its newest deployment serves all traffic. A step the provider cannot
 * do is a skip, and a later step is skipped when the script is not there to read.
 */
export async function checkWorker(
	workers: Pick<Workers, "providerName" | "inspectScript" | "latestDeployment">,
	worker: DeclaredWorker
): Promise<CheckRow[]> {
	const name = worker.label;
	const ids = {
		deployed: `workers:${name}:deployed`,
		bindings: `workers:${name}:bindings`,
		deploy: `workers:${name}:deployment`,
	};
	const titles = {
		deployed: `${name} Worker is deployed and routed`,
		bindings: `${name} Worker has its bindings`,
		deploy: `${name} Worker's latest deployment is healthy`,
	};
	const skipAll = (reason: string): CheckRow[] => [
		row(ids.deployed, titles.deployed, "skip", reason),
		row(ids.bindings, titles.bindings, "skip", reason),
		row(ids.deploy, titles.deploy, "skip", reason),
	];
	if (worker.script === undefined) return skipAll(`${workers.providerName} does not say how it names this Worker`);
	const script = worker.script;
	if (!workers.inspectScript) return skipAll(`the \`${workers.providerName}\` provider cannot read its Workers`);

	const rows: CheckRow[] = [];
	const route = `${worker.host}/*`;
	let exists = false;
	try {
		const state = await workers.inspectScript(script, worker.host);
		exists = state.exists;
		if (!state.exists) {
			const problem = `no Worker named ${script}; \`holocron setup\` deploys it`;
			rows.push(
				row(ids.deployed, titles.deployed, "fail", `${script} not deployed`, [problem]),
				row(ids.bindings, titles.bindings, "skip", `not checked: no Worker named ${script}`)
			);
		} else {
			rows.push(
				state.routes.some((r) => same(r, route))
					? row(ids.deployed, titles.deployed, "ok", `${script} serves ${route}`)
					: row(ids.deployed, titles.deployed, "fail", `no route ${route}`, [
							`${script} has no route ${route}`,
						])
			);
			if (worker.bindings.length === 0) {
				rows.push(row(ids.bindings, titles.bindings, "ok", "none declared"));
			} else {
				const bound = new Set(state.bindingNames.map((n) => n.toUpperCase()));
				const missing = worker.bindings.filter((n) => !bound.has(n.toUpperCase()));
				rows.push(
					missing.length === 0
						? row(
								ids.bindings,
								titles.bindings,
								"ok",
								`${worker.bindings.length} of ${worker.bindings.length} bound`
							)
						: row(
								ids.bindings,
								titles.bindings,
								"fail",
								`${missing.length} not bound`,
								missing.map((n) => `${n}: not bound`)
							)
				);
			}
		}
	} catch (err) {
		const failure = readFailureRow(ids.deployed, titles.deployed, err);
		rows.push(failure, row(ids.bindings, titles.bindings, "skip", "not checked: could not read the Worker"));
	}

	if (!exists) {
		rows.push(row(ids.deploy, titles.deploy, "skip", "not checked: the Worker is not readable or not there"));
	} else if (!workers.latestDeployment) {
		rows.push(
			row(ids.deploy, titles.deploy, "skip", `the \`${workers.providerName}\` provider cannot list deployments`)
		);
	} else {
		try {
			const latest = await workers.latestDeployment(script);
			if (!latest) {
				rows.push(row(ids.deploy, titles.deploy, "skip", `${script} has no recorded deployment`));
			} else if (!latest.active) {
				const problem = `the newest deployment of ${script} does not serve all traffic`;
				rows.push(row(ids.deploy, titles.deploy, "fail", "not serving all traffic", [problem]));
			} else {
				rows.push(
					row(
						ids.deploy,
						titles.deploy,
						"ok",
						latest.createdAt ? `deployed ${latest.createdAt}` : "serving all traffic"
					)
				);
			}
		} catch (err) {
			rows.push(readFailureRow(ids.deploy, titles.deploy, err));
		}
	}
	return rows;
}
