import type { Argv } from "yargs";

/** The arguments a command's `*.args.ts` builder produces: what its handler receives, besides the global options. */
export type InferArgs<Builder> = Builder extends (...args: never[]) => Argv<infer Args> ? Args : never;
