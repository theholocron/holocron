type AssertionLevel = "off" | "warn" | "error";
type MinScoreAssertion = [AssertionLevel, { minScore: number }];
type MaxLengthAssertion = [AssertionLevel, { maxLength: number }];

/** Lighthouse CI assertions for the audits this package knows about, plus any other audit by id. Each is a `[level, options]` pair, where the level is `off`, `warn` or `error`. */
export interface LighthouseAssertion {
	/** Assertion for the back/forward cache audit; fails below `minScore`. */
	"bf-cache"?: MinScoreAssertion;
	/** Assertion for the audit of errors logged to the browser console; fails below `minScore`. */
	"errors-in-console"?: MinScoreAssertion;
	/** Assertion for the `font-display` audit; fails below `minScore`. */
	"font-display"?: MinScoreAssertion;
	/** Assertion for the audit that checks form elements have labels; fails below `minScore`. */
	label?: MinScoreAssertion;
	/** Assertion for the Largest Contentful Paint audit; fails below `minScore`. */
	"largest-contentful-paint"?: MinScoreAssertion;
	/** Assertion for the audit that flags a lazy-loaded Largest Contentful Paint image; fails below `minScore`. */
	"lcp-lazy-loaded"?: MinScoreAssertion;
	/** Assertion for the audit that flags animations that cannot run on the compositor; fails below `minScore`. */
	"non-composited-animations"?: MinScoreAssertion;
	/** Assertion for the audit that checks the Largest Contentful Paint image is prioritised; fails below `minScore`. */
	"prioritize-lcp-image"?: MinScoreAssertion;
	/** Assertion for the unused JavaScript audit; `maxLength` caps how many items it may report. */
	"unused-javascript"?: MaxLengthAssertion;
	/** Assertion for the cache lifetime audit; `maxLength` caps how many items it may report. */
	"uses-long-cache-ttl"?: MaxLengthAssertion;
	[key: string]: MinScoreAssertion | MaxLengthAssertion | undefined;
}

/** The assertions used when `defineConfig` is given none: each is a warning, with a minimum score of 0.9 (or zero reported items for the two `maxLength` audits). */
export const defaultAssertions: LighthouseAssertion = {
	"bf-cache": ["warn", { minScore: 0.9 }],
	"errors-in-console": ["warn", { minScore: 0.9 }],
	"font-display": ["warn", { minScore: 0.9 }],
	label: ["warn", { minScore: 0.9 }],
	"largest-contentful-paint": ["warn", { minScore: 0.9 }],
	"lcp-lazy-loaded": ["warn", { minScore: 0.9 }],
	"non-composited-animations": ["warn", { minScore: 0.9 }],
	"prioritize-lcp-image": ["warn", { minScore: 0.9 }],
	"unused-javascript": ["warn", { maxLength: 0 }],
	"uses-long-cache-ttl": ["warn", { maxLength: 0 }],
};

/** Options for `defineConfig`. */
export interface LighthouseConfigOptions {
	/** The URL, or URLs, Lighthouse CI audits (lhci `collect.url`). */
	url: string | string[];
	/** The command lhci runs to start the site before auditing (lhci `collect.startServerCommand`). Omitted when unset. */
	startServerCommand?: string;
	/** Pattern lhci waits for in server stdout before running audits. Defaults to lhci's built-in /(listen|ready)/i. */
	startServerReadyPattern?: string;
	/** Milliseconds to wait for startServerReadyPattern before timing out. */
	startServerReadyTimeout?: number;
	/** Per-audit assertions (lhci `assert.assertions`). Defaults to `defaultAssertions`. */
	assertions?: LighthouseAssertion;
	/** @default "temporary-public-storage" */
	uploadTarget?: string;
}

/** Builds a Lighthouse CI (`lhci`) configuration: what to collect, which assertions to enforce and where to upload the results. */
export function defineConfig({
	url,
	startServerCommand,
	startServerReadyPattern,
	startServerReadyTimeout,
	assertions = defaultAssertions,
	uploadTarget = "temporary-public-storage",
}: LighthouseConfigOptions) {
	return {
		ci: {
			collect: {
				url: Array.isArray(url) ? url : [url],
				...(startServerCommand ? { startServerCommand } : {}),
				...(startServerReadyPattern !== undefined ? { startServerReadyPattern } : {}),
				...(startServerReadyTimeout !== undefined ? { startServerReadyTimeout } : {}),
			},
			assert: { assertions },
			upload: { target: uploadTarget },
		},
	};
}
