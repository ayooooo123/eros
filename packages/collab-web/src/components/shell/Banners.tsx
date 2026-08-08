import type { ReactNode } from "react";
import { useEffect } from "react";
import type { ConnectionPhase } from "../../lib/client";
import { drench } from "../wall/WetLayer";

export interface BannersProps {
	phase: ConnectionPhase;
	endedReason: string | null;
	onRejoin(): void;
	onNewLink(): void;
}

export function Banners({ phase, endedReason, onRejoin, onNewLink }: BannersProps): ReactNode {
	// The moment the thread is cut, the whole pane runs.
	useEffect(() => {
		if (phase === "ended") drench();
	}, [phase]);

	if (phase === "connecting" || phase === "waiting") {
		return (
			<div className="sh-banner" role="status">
				<span className="sh-banner-dot" />
				{phase === "connecting" ? "reaching the relay" : "waiting to be let in"}
			</div>
		);
	}
	if (phase === "reconnecting") {
		return (
			<div className="sh-banner" role="status">
				<span className="sh-banner-dot" />
				thread slipped · reaching back
			</div>
		);
	}
	if (phase === "ended") {
		return (
			<div className="sh-ended" role="alertdialog" aria-label="the gateway closed">
				<div className="sh-ended-card">
					<span className="sh-ended-legend">severed</span>
					<div className="sh-ended-body">
						<div className="sh-ended-title">the gateway closed</div>
						{endedReason && <div className="sh-ended-reason">{endedReason}</div>}
						<div className="sh-ended-actions">
							<button type="button" className="sh-btn sh-btn-primary" onClick={onRejoin}>
								Re-enter
							</button>
							<button type="button" className="sh-btn" onClick={onNewLink}>
								New invitation
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	}
	return null;
}
