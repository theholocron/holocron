/** Ambient declarations: *.yml and *.md files are inlined as strings by the rawYml rollup plugin. */
declare module "*.yml" {
	const content: string;
	export default content;
}
declare module "*.md" {
	const content: string;
	export default content;
}
