import type {
	MonitoringCheckInput,
	MonitoringDashboardInput,
	MonitoringHeartbeatInput,
	MonitoringStatusPageInput,
} from "@theholocron/cli";

import orgArea from "./org.js";

const { domain } = orgArea;

// The docs site serves the logo and the icon from its `public/` folder (`docs/public/`), so they answer once the docs
// are deployed from `main`; until then Checkly shows a broken image, which is expected (#2355).
const docsSite = `https://docs.${domain}/holocron`;
const logo = `${docsSite}/logos/profile.v2.webp`;
const favicon = `${docsSite}/favicon.svg`;

// The `monitoring` provider's options for this repo (Checkly, #2302), imported by `holocron.config.ts`. Checks sit
// next to the service they watch (apps/sentinel, apps/comlink); the docs site's is here, with the heartbeats, the
// dashboard and the status page, which pick checks by tag (with `automation` on, a failing check also opens an incident
// on its component). The free plan refuses a private dashboard (400), a status page domain (402) and automated
// incidents (403), so the dashboard is public and served on `status.${domain}` (its CNAME and TXT records are in
// `dns-records.json`), the page has none and `automation: false`. On a paid plan drop `private: false` (the view key
// goes to `dev`, `doctor.manualSecrets`) and `automation: false`. The account id is in `org.ts`. Not an area file
// (`HOLOCRON_AREAS` stays closed): the config imports it by name, as it imports `org.ts`, and Sentinel's remote config
// check fetches the whole `.holocron/` tree. Keep it plain data with type-only imports from the CLI.
export default function monitoring(description: string) {
	return {
		checks: [
			{
				name: "Docs",
				url: `https://docs.${domain}/holocron/`,
				locations: ["us-east-1"],
				tags: ["docs"],
				assertions: [{ source: "status_code", comparison: "equals", target: "200" }],
			},
		],
		// One per scheduled workflow whose silence matters (#2359): the workflow's last step pings the URL held in
		// `HOLOCRON_HEARTBEAT_<NAME>` (`repo.secrets.sync`, names only) on success, so a run that stops or goes red is
		// noticed. GitHub delays or drops scheduled runs under load, so a daily job gets a 6 hour grace and an hourly
		// one 2 hours, which one late run does not trip. Not a status page component: tagged `scheduled`, which no
		// dashboard or component lists.
		heartbeats: [
			{
				name: "check-tokens",
				period: 1,
				periodUnit: "days",
				grace: 6,
				graceUnit: "hours",
				tags: ["scheduled"],
			},
			{
				name: "doctor-tokens",
				period: 1,
				periodUnit: "days",
				grace: 6,
				graceUnit: "hours",
				tags: ["scheduled"],
			},
			{
				name: "sync-specs",
				period: 1,
				periodUnit: "hours",
				grace: 2,
				graceUnit: "hours",
				tags: ["scheduled"],
			},
			{
				name: "reconcile-projects",
				period: 1,
				periodUnit: "hours",
				grace: 2,
				graceUnit: "hours",
				tags: ["scheduled"],
			},
		],
		dashboards: [
			{
				name: "The Holocron",
				description,
				tags: ["sentinel", "comlink", "docs"],
				private: false,
				domain: `status.${domain}`,
				logo,
				favicon,
				link: `${docsSite}/`,
			},
		],
		statusPages: [
			{
				name: "The Holocron",
				slug: "theholocron",
				description,
				footer: "The Holocron: the status of Sentinel, Comlink and the docs site.",
				privacyUrl: `https://docs.${domain}/holocron/legal/privacy/`,
				termsUrl: `https://docs.${domain}/holocron/legal/terms/`,
				supportUrl: `https://docs.${domain}/holocron/`,
				logo,
				favicon,
				link: `${docsSite}/`,
				automation: false,
				components: [
					{ name: "Sentinel", tags: ["sentinel"] },
					{ name: "Comlink", tags: ["comlink"] },
					{ name: "Docs", tags: ["docs"] },
				],
			},
		],
	} satisfies {
		checks: MonitoringCheckInput[];
		heartbeats: MonitoringHeartbeatInput[];
		dashboards: MonitoringDashboardInput[];
		statusPages: MonitoringStatusPageInput[];
	};
}
