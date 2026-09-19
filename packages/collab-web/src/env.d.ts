declare module "*.css";

declare module "*.webp" {
	/** Bundler-resolved asset URL. */
	const url: string;
	export default url;
}
