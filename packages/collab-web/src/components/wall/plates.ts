/**
 * The plates.
 *
 * Thirty curated deep-mark keepers (round3 `filter=love`/`filter=like`), picked
 * by rendering every candidate through the actual cell-art pipeline and keeping
 * only the frames that stay unmistakable at cell resolution: filled frames,
 * hard figure/ground, spot red that survives quantization. Muddy, low-contrast
 * and tiny-subject frames were rejected — at 2x4 sub-cells a small subject just
 * disappears under the transcript column.
 *
 * Imported (not string-pathed) so the bundler emits them for both the dev server
 * and `dist/`: no runtime remote URLs, ever. 640px wide WebP, ~2.2 MB total,
 * which is ~1.6x oversampled against the largest grid the wall ever asks for.
 */
import m01 from "../../../public/eros/m01.webp";
import m02 from "../../../public/eros/m02.webp";
import m03 from "../../../public/eros/m03.webp";
import m04 from "../../../public/eros/m04.webp";
import m05 from "../../../public/eros/m05.webp";
import m06 from "../../../public/eros/m06.webp";
import m07 from "../../../public/eros/m07.webp";
import m08 from "../../../public/eros/m08.webp";
import m09 from "../../../public/eros/m09.webp";
import m10 from "../../../public/eros/m10.webp";
import m11 from "../../../public/eros/m11.webp";
import m12 from "../../../public/eros/m12.webp";
import m13 from "../../../public/eros/m13.webp";
import m14 from "../../../public/eros/m14.webp";
import m15 from "../../../public/eros/m15.webp";
import m16 from "../../../public/eros/m16.webp";
import m17 from "../../../public/eros/m17.webp";
import m18 from "../../../public/eros/m18.webp";
import m19 from "../../../public/eros/m19.webp";
import m20 from "../../../public/eros/m20.webp";
import m21 from "../../../public/eros/m21.webp";
import m22 from "../../../public/eros/m22.webp";
import m23 from "../../../public/eros/m23.webp";
import m24 from "../../../public/eros/m24.webp";
import m25 from "../../../public/eros/m25.webp";
import m26 from "../../../public/eros/m26.webp";
import m27 from "../../../public/eros/m27.webp";
import m28 from "../../../public/eros/m28.webp";
import m29 from "../../../public/eros/m29.webp";
import m30 from "../../../public/eros/m30.webp";

/** Rotation order: the strongest frames lead, so the first look is the loudest. */
export const ART_PLATES: readonly string[] = [
	m01,
	m02,
	m03,
	m04,
	m05,
	m06,
	m07,
	m08,
	m09,
	m10,
	m11,
	m12,
	m13,
	m14,
	m15,
	m16,
	m17,
	m18,
	m19,
	m20,
	m21,
	m22,
	m23,
	m24,
	m25,
	m26,
	m27,
	m28,
	m29,
	m30,
];

/** Deterministic starting frame, so one room always opens on the same skin. */
export function plateIndexFor(seed: string): number {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return Math.abs(h) % ART_PLATES.length;
}
