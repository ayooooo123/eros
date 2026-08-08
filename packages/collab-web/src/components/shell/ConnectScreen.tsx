import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ErosWall } from "../wall/ErosWall";
import { ART_PLATES } from "../wall/plates";
import { smear, spurt } from "../wall/WetLayer";
import { CellInput } from "./CellInput";

export interface ConnectScreenProps {
	defaultName: string;
	error: string | null;
	onConnect(link: string, name: string): void;
}

export function ConnectScreen({ defaultName, error, onConnect }: ConnectScreenProps): ReactNode {
	const [link, setLink] = useState("");
	const [name, setName] = useState(defaultName);
	const [localError, setLocalError] = useState<string | null>(null);
	const submitRef = useRef<HTMLButtonElement | null>(null);
	const errorRef = useRef<HTMLDivElement | null>(null);

	const shown = localError ?? error;

	// A refusal is dragged down the glass.
	useEffect(() => {
		if (shown !== null) smear(errorRef.current);
	}, [shown]);

	const submit = (e: FormEvent<HTMLFormElement>): void => {
		e.preventDefault();
		const trimmed = link.trim();
		spurt(submitRef.current, 1.3);
		if (!trimmed) {
			setLocalError("nothing to open — put your key in first");
			return;
		}
		setLocalError(null);
		onConnect(trimmed, name.trim() || "Master");
	};

	return (
		<div className="sh-connect">
			<ErosWall plates={ART_PLATES} className="wl-wall--stage" burn={1} ink={9} heat={0.22} rotateMs={18000} />
			<div className="sh-connect-stage">
				<h1 className="sh-wordmark">
					<span className="sh-wordmark-name">
						eros
						<span className="sh-wordmark-caret" aria-hidden="true" />
					</span>
					<span className="sh-wordmark-role">gateway</span>
				</h1>
				<p className="sh-connect-sub">she is already awake · put your key in</p>
				<form className="sh-connect-card" onSubmit={submit}>
					<span className="sh-connect-legend">open</span>
					<label className="sh-field">
						<span className="sh-field-label">key</span>
						<CellInput
							value={link}
							onChange={setLink}
							placeholder="ws://host:port/r/room.key"
							mono
							autoFocus
							aria-label="gateway key"
						/>
						<span className="sh-field-hint">your key — she opens for it and nothing else</span>
					</label>
					<label className="sh-field">
						<span className="sh-field-label">your name</span>
						<CellInput value={name} onChange={setName} placeholder="Master" maxLength={32} aria-label="your name" />
					</label>
					{shown !== null && (
						<div className="sh-connect-error" ref={errorRef}>
							{shown}
						</div>
					)}
					<button className="sh-btn sh-btn-primary sh-connect-submit" type="submit" ref={submitRef}>
						Enter
					</button>
				</form>
				<p className="sh-connect-foot">the room key never leaves this url</p>
			</div>
		</div>
	);
}
