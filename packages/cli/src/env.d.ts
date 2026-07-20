/** Ambient declaration: *.yml files are inlined as strings by the rawYml rollup plugin. */
declare module "*.yml" {
	const content: string;
	export default content;
}
