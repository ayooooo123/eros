/** React binding for {@link GatewayClient} via `useSyncExternalStore`. */
import { useSyncExternalStore } from "react";
import type { GatewayClient, GatewaySnapshot } from "./client";

export function useGatewaySnapshot(client: GatewayClient): GatewaySnapshot {
	return useSyncExternalStore(
		listener => client.subscribe(listener),
		() => client.getSnapshot(),
		() => client.getSnapshot(),
	);
}
