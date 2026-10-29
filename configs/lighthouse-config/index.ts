type AssertionLevel = "off" | "warn" | "error";
type MinScoreAssertion = [AssertionLevel, { minScore: number }];
type MaxLengthAssertion = [AssertionLevel, { maxLength: number }];

export interface LighthouseAssertion {
	"bf-cache"?: MinScoreAssertion;
	"errors-in-console"?: MinScoreAssertion;
	"font-display"?: MinScoreAssertion;
	label?: MinScoreAssertion;
	"largest-contentful-paint"?: MinScoreAssertion;
	"lcp-lazy-loaded"?: MinScoreAssertion;
	"non-composited-animations"?: MinScoreAssertion;
	"prioritize-lcp-image"?: MinScoreAssertion;
	"unused-javascript"?: MaxLengthAssertion;
	"uses-long-cache-ttl"?: MaxLengthAssertion;
	[key: string]: MinScoreAssertion | MaxLengthAssertion | undefined;
}

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

export interface LighthouseConfigOptions {
	url: string | string[];
	startServerCommand?: string;
	/** Pattern lhci waits for in server stdout before running audits. Defaults to lhci's built-in /(listen|ready)/i. */
	startServerReadyPattern?: string;
	/** Milliseconds to wait for startServerReadyPattern before timing out. */
	startServerReadyTimeout?: number;
	assertions?: LighthouseAssertion;
	/** @default "temporary-public-storage" */
	uploadTarget?: string;
}

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
