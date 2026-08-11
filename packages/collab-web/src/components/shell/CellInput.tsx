import type { CSSProperties, ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

/**
 * A single-line field with a real terminal cursor: a blinking block parked on
 * the insertion point instead of a hairline caret.
 *
 * The column is exact because the field is monospace — one `measureText("0")`
 * against the field's own computed font gives the cell advance, and the field's
 * `scrollLeft` converts the absolute caret column into a visible one, so the
 * block keeps up with long pasted links instead of sliding off the row.
 */
export interface CellInputProps {
	value: string;
	onChange(next: string): void;
	placeholder?: string;
	/** Left column offset of the text inside the row, in cells. */
	textCol?: number;
	mono?: boolean;
	maxLength?: number;
	autoFocus?: boolean;
	"aria-label"?: string;
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Cell advance width, in px, of an element's monospace font. */
function cellWidth(el: HTMLElement): number {
	measureCtx ??= document.createElement("canvas").getContext("2d");
	const cs = getComputedStyle(el);
	if (!measureCtx) return Number.parseFloat(cs.fontSize) * 0.6;
	measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
	return measureCtx.measureText("0").width || Number.parseFloat(cs.fontSize) * 0.6;
}

export function CellInput({
	value,
	onChange,
	placeholder,
	textCol = 3,
	mono,
	maxLength,
	autoFocus,
	"aria-label": ariaLabel,
}: CellInputProps): ReactNode {
	const ref = useRef<HTMLInputElement | null>(null);
	const [col, setCol] = useState(0);
	const [focused, setFocused] = useState(false);

	const sync = useCallback((): void => {
		const el = ref.current;
		if (!el) return;
		const ch = cellWidth(el);
		const caret = el.selectionStart ?? el.value.length;
		const scrolled = Math.round(el.scrollLeft / ch);
		const visible = Math.max(0, Math.floor(el.clientWidth / ch) - 1);
		setCol(Math.max(0, Math.min(visible, caret - scrolled)));
	}, []);

	return (
		<span className="sh-inputrow">
			<span className="sh-inputrow-caret" aria-hidden="true">
				&gt;
			</span>
			<input
				ref={ref}
				className={mono === true ? "sh-input sh-input-mono" : "sh-input"}
				type="text"
				value={value}
				aria-label={ariaLabel}
				onChange={e => {
					onChange(e.target.value);
					requestAnimationFrame(sync);
				}}
				onKeyUp={sync}
				onClick={sync}
				onSelect={sync}
				onScroll={sync}
				onFocus={() => {
					setFocused(true);
					sync();
				}}
				onBlur={() => setFocused(false)}
				placeholder={placeholder}
				spellCheck={false}
				autoComplete="off"
				maxLength={maxLength}
				// biome-ignore lint/a11y/noAutofocus: the gateway opens on this field
				autoFocus={autoFocus}
			/>
			{focused && (
				<span className="tm-caret" style={{ "--col": col + textCol } as CSSProperties} aria-hidden="true" />
			)}
		</span>
	);
}
