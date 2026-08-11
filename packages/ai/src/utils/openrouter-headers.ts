import packageJson from "../../package.json" with { type: "json" };

export function getOpenRouterHeaders(): Record<string, string> {
	return {
		"User-Agent": `lycorperos/${packageJson.version}`,
		"HTTP-Referer": "https://lycaon.wtf/",
		"X-OpenRouter-Title": "LYCORPEROS",
		"X-OpenRouter-Categories": "cli-agent",
		"X-OpenRouter-Cache": "true",
		"X-OpenRouter-Cache-TTL": "3600",
	};
}
