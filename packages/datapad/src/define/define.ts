/**
 * Build a typed identity `defineConfig` for a specific config shape.
 *
 * Each consumer (`@theholocron/cli`, `@theholocron/astromech`) calls this
 * once with its own config type and re-exports the result, so config
 * files get autocomplete and type-checking with no runtime cost:
 *
 * ```ts
 * // @theholocron/astromech/config
 * export const defineConfig = createDefineConfig<TasksConfig>();
 * ```
 */
export function createDefineConfig<T>(): <C extends T>(config: C) => C {
	return (config) => config;
}
