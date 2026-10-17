import { deepMerge as mergeConfig } from "@theholocron/object-utils";

/**
 * Deep-merges config layers, lowest priority first (a later layer wins on
 * scalars; arrays concatenate; nested objects merge). `undefined` layers are
 * skipped. Returns `undefined` when there is no layer to merge. The result is
 * a copy for object layers — it never aliases a layer.
 *
 * The one merge `loadLayered` and every caller layering configs it loaded
 * some other way (content from an API, say) use, so layering means the same
 * thing everywhere.
 */
export function mergeLayers<T>(layers: readonly (T | undefined)[]): T | undefined {
	const present = layers.filter((layer): layer is T => layer !== undefined);
	if (present.length === 0) return undefined;
	return present.reduce<T>((acc, layer) => mergeConfig(acc, layer), {} as T);
}
