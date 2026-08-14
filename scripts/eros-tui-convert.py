#!/usr/bin/env python3
"""Convert explicit raster sources into EROS terminal-native Braille art."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import re
import subprocess
import tempfile
from dataclasses import dataclass

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps, UnidentifiedImageError

DOT_BITS = ((0x01, 0x08), (0x02, 0x10), (0x04, 0x20), (0x40, 0x80))
DECISION_PATH = pathlib.Path(__file__).resolve().parents[1] / "assets" / "tui-art" / "eros-braille-method.json"


class ConversionError(RuntimeError):
    pass


@dataclass(frozen=True)
class BrailleFrame:
    cols: int
    rows: int
    dots: tuple[int, ...]
    tones: tuple[float, ...]
    cell_colors: tuple[tuple[int, int, int], ...]
    crop_box: tuple[int, int, int, int] | None
    fit: str


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def flattened_pixels(image: Image.Image):
    getter = getattr(image, "get_flattened_data", None)
    return getter() if getter is not None else image.getdata()


def write_json(path: pathlib.Path, value: object) -> None:
    write_text(path, json.dumps(value, indent=2, sort_keys=True) + "\n")


def write_text(path: pathlib.Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        newline="\n",
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        delete=False,
    ) as temporary:
        temporary.write(value)
        temporary_path = pathlib.Path(temporary.name)
    try:
        temporary_path.replace(path)
    finally:
        temporary_path.unlink(missing_ok=True)


def save_png(path: pathlib.Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "wb",
        dir=path.parent,
        prefix=f".{path.stem}.",
        suffix=".png",
        delete=False,
    ) as temporary:
        temporary_path = pathlib.Path(temporary.name)
    try:
        image.save(temporary_path, format="PNG", optimize=True)
        temporary_path.replace(path)
    finally:
        temporary_path.unlink(missing_ok=True)


def percentile(histogram: list[int], fraction: float) -> int:
    target = sum(histogram) * fraction
    seen = 0
    for value, count in enumerate(histogram):
        seen += count
        if seen >= target:
            return value
    return 255


def srgb_linear_luma(image: Image.Image) -> Image.Image:
    """Discard chroma, preserving only Rec. 709 luminance in linear light."""
    rgb = image.convert("RGB")
    linear_channels: list[Image.Image] = []
    for channel in rgb.split():
        lut: list[int] = []
        for value in range(256):
            srgb = value / 255.0
            linear = srgb / 12.92 if srgb <= 0.04045 else ((srgb + 0.055) / 1.055) ** 2.4
            lut.append(round(linear * 255))
        linear_channels.append(channel.point(lut))
    red, green, blue = linear_channels
    return Image.merge("RGB", (red, green, blue)).convert("L", matrix=(0.2126, 0.7152, 0.0722, 0))


def normalized_luma(image: Image.Image) -> tuple[Image.Image, dict[str, int | float | str]]:
    luma = srgb_linear_luma(image)
    width, height = luma.size
    span = min(max(1, min(width, height) // 48), width, height)
    border_hist = [0] * 256
    border_crops = (
        (0, 0, width, span),
        (0, height - span, width, height),
        (0, 0, span, height),
        (width - span, 0, width, height),
    )
    for crop in border_crops:
        for value, count in enumerate(luma.crop(crop).histogram()):
            border_hist[value] += count
    border_total = sum(border_hist) or 1
    border_median = percentile(border_hist, 0.5)
    border_bright_fraction = sum(border_hist[72:]) / border_total
    invert = border_median >= 72 and border_bright_fraction >= 0.55
    if invert:
        luma = ImageOps.invert(luma)

    histogram = luma.histogram()
    black = max(percentile(histogram, 0.01), 255 - border_median if invert else 0)
    white = max(black + 1, percentile(histogram, 0.995))
    low_sigmoid = 1.0 / (1.0 + math.exp(4.8 * 0.44))
    high_sigmoid = 1.0 / (1.0 + math.exp(-4.8 * (1.0 - 0.44)))
    lut: list[int] = []
    for value in range(256):
        scaled = max(0.0, min(1.0, (value - black) / (white - black)))
        curved = 1.0 / (1.0 + math.exp(-4.8 * (scaled - 0.44)))
        curved = (curved - low_sigmoid) / (high_sigmoid - low_sigmoid)
        normalized = max(0.0, min(1.0, scaled * 0.22 + curved * 0.78))
        lut.append(round(normalized * 255))
    return luma.point(lut), {
        "black": black,
        "white": white,
        "polarity": "inverted-light-ground" if invert else "direct-dark-ground",
        "borderMedianLinear": border_median,
        "borderBrightFraction": round(border_bright_fraction, 5),
    }


def cover_box(size: tuple[int, int], aspect: float, focus: tuple[float, float]) -> tuple[int, int, int, int]:
    width, height = size
    source_aspect = width / height
    if source_aspect > aspect:
        crop_height = height
        crop_width = max(1, round(height * aspect))
    else:
        crop_width = width
        crop_height = max(1, round(width / aspect))
    center_x = focus[0] * width
    center_y = focus[1] * height
    left = round(max(0, min(width - crop_width, center_x - crop_width / 2)))
    top = round(max(0, min(height - crop_height, center_y - crop_height / 2)))
    return (left, top, left + crop_width, top + crop_height)


def frame_luma(
    source: Image.Image,
    size: tuple[int, int],
    fit: str,
    focus: tuple[float, float],
) -> tuple[Image.Image, tuple[int, int, int, int] | None]:
    target_width, target_height = size
    target_aspect = target_width / target_height
    if fit == "contain":
        framed = Image.new("L", size, 0)
        scale = min(target_width / source.width, target_height / source.height)
        resized = source.resize(
            (max(1, round(source.width * scale)), max(1, round(source.height * scale))),
            Image.Resampling.LANCZOS,
        )
        left = round((target_width - resized.width) * focus[0])
        top = round((target_height - resized.height) * focus[1])
        left = max(0, min(target_width - resized.width, left))
        top = max(0, min(target_height - resized.height, top))
        framed.paste(resized, (left, top))
        return framed.filter(ImageFilter.UnsharpMask(radius=0.8, percent=110, threshold=2)), None

    crop = cover_box(source.size, target_aspect, focus)
    framed = source.crop(crop).resize(size, Image.Resampling.LANCZOS)
    return framed.filter(ImageFilter.UnsharpMask(radius=0.8, percent=110, threshold=2)), crop


def frame_rgb(
    source: Image.Image,
    size: tuple[int, int],
    fit: str,
    focus: tuple[float, float],
) -> Image.Image:
    """Frame the chosen flesh in full color for the final half-block kiss."""
    target_width, target_height = size
    if fit == "contain":
        framed = Image.new("RGB", size, (0, 0, 0))
        scale = min(target_width / source.width, target_height / source.height)
        resized = source.resize(
            (max(1, round(source.width * scale)), max(1, round(source.height * scale))),
            Image.Resampling.LANCZOS,
        )
        left = round((target_width - resized.width) * focus[0])
        top = round((target_height - resized.height) * focus[1])
        left = max(0, min(target_width - resized.width, left))
        top = max(0, min(target_height - resized.height, top))
        framed.paste(resized, (left, top))
    else:
        crop = cover_box(source.size, target_width / target_height, focus)
        framed = source.crop(crop).resize(size, Image.Resampling.LANCZOS)
    return framed.filter(ImageFilter.UnsharpMask(radius=0.7, percent=105, threshold=2))


def load_decision() -> dict[str, object]:
    try:
        decision = json.loads(DECISION_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ConversionError(f"cannot read EROS Braille decision: {error}") from error
    if not isinstance(decision, dict):
        raise ConversionError("EROS Braille decision must be a JSON object")
    if (
        decision.get("schema") != "eros-tui/braille-method-decision"
        or decision.get("status") != "authoritative"
        or decision.get("selectedMethod") != "chafa"
    ):
        raise ConversionError("EROS Braille decision is not authoritative Chafa configuration")
    invocation = decision.get("invocation")
    if not isinstance(invocation, list) or not invocation or invocation[0] != "chafa":
        raise ConversionError("EROS Braille decision has no Chafa invocation")
    return decision


def require_chafa(decision: dict[str, object]) -> str:
    expected = decision.get("requiredChafaVersion")
    invocation = decision.get("invocation")
    if not isinstance(expected, str) or not isinstance(invocation, list) or not invocation:
        raise ConversionError("EROS Braille decision is missing the Chafa version pin")
    binary = str(invocation[0])
    try:
        result = subprocess.run([binary, "--version"], check=False, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise ConversionError(f"Chafa {expected} is required for EROS Braille conversion") from error
    first_line = next((line.strip() for line in result.stdout.splitlines() if line.strip()), "")
    version = first_line.removeprefix("Chafa version ").strip()
    if result.returncode != 0 or version != expected:
        raise ConversionError(f"EROS requires Chafa {expected}, but `chafa --version` returned {first_line!r}")
    return version


def palette_stops(decision: dict[str, object]) -> tuple[tuple[float, tuple[int, int, int]], ...]:
    palette = decision.get("palette")
    if not isinstance(palette, dict):
        raise ConversionError("EROS Braille decision is missing its palette")
    raw_stops = palette.get("stops")
    if not isinstance(raw_stops, list) or len(raw_stops) < 2:
        raise ConversionError("EROS Braille decision palette needs at least two stops")
    stops: list[tuple[float, tuple[int, int, int]]] = []
    for stop in raw_stops:
        if not isinstance(stop, dict) or not isinstance(stop.get("at"), (int, float)):
            raise ConversionError("EROS Braille decision has an invalid palette stop")
        rgb = stop.get("rgb")
        if not isinstance(rgb, list) or len(rgb) != 3 or any(not isinstance(channel, int) for channel in rgb):
            raise ConversionError("EROS Braille decision has an invalid palette color")
        position = float(stop["at"])
        color = tuple(rgb)
        if not 0.0 <= position <= 1.0 or any(channel < 0 or channel > 255 for channel in color):
            raise ConversionError("EROS Braille decision palette is out of range")
        stops.append((position, color))
    if stops != sorted(stops, key=lambda stop: stop[0]):
        raise ConversionError("EROS Braille decision palette must be ordered")
    return tuple(stops)


def ramp_rgb(value: float, stops: tuple[tuple[float, tuple[int, int, int]], ...]) -> tuple[int, int, int]:
    value = max(0.0, min(1.0, value))
    for index in range(len(stops) - 1):
        left_at, left = stops[index]
        right_at, right = stops[index + 1]
        if value <= right_at:
            blend = 0.0 if right_at == left_at else (value - left_at) / (right_at - left_at)
            return tuple(round(left[channel] + (right[channel] - left[channel]) * blend) for channel in range(3))
    return stops[-1][1]


def parse_chafa_output(output: str, cols: int, rows: int) -> tuple[int, ...]:
    lines = output.splitlines()
    if len(lines) != rows:
        raise ConversionError(f"Chafa returned {len(lines)} rows, expected {rows}")
    dots = [0] * (cols * 2 * rows * 4)
    dot_width = cols * 2
    for row, line in enumerate(lines):
        if len(line) > cols:
            raise ConversionError(f"Chafa row {row} returned {len(line)} cells, expected at most {cols}")
        for col, glyph in enumerate(line.ljust(cols)):
            if glyph == " ":
                continue
            code = ord(glyph)
            if not 0x2800 <= code <= 0x28FF:
                raise ConversionError(f"Chafa emitted non-Braille U+{code:04X} at row {row}, column {col}")
            bits = code - 0x2800
            for dot_y in range(4):
                for dot_x in range(2):
                    if bits & DOT_BITS[dot_y][dot_x]:
                        dots[(row * 4 + dot_y) * dot_width + col * 2 + dot_x] = 1
    return tuple(dots)


def braille_bits(frame: BrailleFrame, row: int, col: int) -> int:
    dot_width = frame.cols * 2
    bits = 0
    for dot_y in range(4):
        offset = (row * 4 + dot_y) * dot_width + col * 2
        if frame.dots[offset]:
            bits |= DOT_BITS[dot_y][0]
        if frame.dots[offset + 1]:
            bits |= DOT_BITS[dot_y][1]
    return bits


def build_braille_frame(
    luma: Image.Image,
    cols: int,
    rows: int,
    fit: str,
    focus: tuple[float, float],
    decision: dict[str, object],
    stops: tuple[tuple[float, tuple[int, int, int]], ...],
) -> BrailleFrame:
    framed, crop = frame_luma(luma, (cols * 2, rows * 4), fit, focus)
    fine = framed.filter(ImageFilter.GaussianBlur(0.65))
    coarse = framed.filter(ImageFilter.GaussianBlur(1.9))
    edges = ImageOps.autocontrast(ImageChops.difference(fine, coarse), cutoff=1)
    tones = tuple(
        max(tone / 255.0, edge / 255.0 * 0.72)
        for tone, edge in zip(flattened_pixels(framed), flattened_pixels(edges))
    )

    invocation = decision["invocation"]
    if not isinstance(invocation, list):
        raise ConversionError("EROS Braille decision has an invalid Chafa invocation")
    with tempfile.TemporaryDirectory(prefix="eros-tui-chafa-") as temporary:
        framed_source = pathlib.Path(temporary) / "framed-luma.png"
        framed.save(framed_source, format="PNG", optimize=True)
        command = [
            str(token).format(cols=cols, rows=rows, framedSourcePng=str(framed_source))
            for token in invocation
        ]
        result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise ConversionError(f"Chafa Braille conversion failed: {result.stderr.strip()}")

    dots = parse_chafa_output(result.stdout, cols, rows)
    dot_width = cols * 2
    colors: list[tuple[int, int, int]] = []
    for row in range(rows):
        for col in range(cols):
            active_tones = [
                tones[(row * 4 + dot_y) * dot_width + col * 2 + dot_x]
                for dot_y in range(4)
                for dot_x in range(2)
                if dots[(row * 4 + dot_y) * dot_width + col * 2 + dot_x]
            ]
            cell_tone = max(0.22, sum(active_tones) / len(active_tones)) if active_tones else 0.0
            colors.append(ramp_rgb(cell_tone, stops))
    return BrailleFrame(cols, rows, dots, tones, tuple(colors), crop, fit)


def braille_rows(frame: BrailleFrame, truecolor: bool = False) -> list[str]:
    rows: list[str] = []
    for row in range(frame.rows):
        cells: list[str] = []
        for col in range(frame.cols):
            bits = braille_bits(frame, row, col)
            if not bits:
                cells.append(" ")
                continue
            glyph = chr(0x2800 + bits)
            if truecolor:
                red, green, blue = frame.cell_colors[row * frame.cols + col]
                cells.append(f"\x1b[38;2;{red};{green};{blue}m{glyph}\x1b[0m")
            else:
                cells.append(glyph)
        line = "".join(cells)
        if not truecolor and line.endswith(" "):
            line = line[:-1] + "\u2800"
        elif truecolor and line.endswith(" "):
            line = line[:-1] + "\u2800"
        rows.append(line)
    return rows


def halfblock_rows(image: Image.Image) -> list[str]:
    """Pair upper and lower pixels so her selected render lands in truecolor."""
    if image.height % 2 != 0:
        raise ConversionError("half-block source height must be even")
    pixels = image.load()
    rows: list[str] = []
    for y in range(0, image.height, 2):
        cells: list[str] = []
        for x in range(image.width):
            upper = pixels[x, y]
            lower = pixels[x, y + 1]
            cells.append(
                f"\x1b[38;2;{upper[0]};{upper[1]};{upper[2]}m"
                f"\x1b[48;2;{lower[0]};{lower[1]};{lower[2]}m▀\x1b[0m"
            )
        rows.append("".join(cells))
    return rows


def witness_image(frame: BrailleFrame) -> Image.Image:
    dot_pitch_x = 5
    dot_pitch_y = 5
    margin = 2
    cell_width = margin * 2 + dot_pitch_x * 2
    cell_height = margin * 2 + dot_pitch_y * 4
    witness = Image.new("RGB", (frame.cols * cell_width, frame.rows * cell_height), (0, 0, 0))
    draw = ImageDraw.Draw(witness)
    for row in range(frame.rows):
        for col in range(frame.cols):
            color = frame.cell_colors[row * frame.cols + col]
            for dot_y in range(4):
                for dot_x in range(2):
                    dot_width = frame.cols * 2
                    if not frame.dots[(row * 4 + dot_y) * dot_width + col * 2 + dot_x]:
                        continue
                    left = col * cell_width + margin + dot_x * dot_pitch_x
                    top = row * cell_height + margin + dot_y * dot_pitch_y
                    draw.rounded_rectangle((left, top, left + 3, top + 3), radius=1, fill=color)
    return witness


def parse_positive_int(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("must be an integer") from error
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def parse_focus(value: str) -> tuple[float, float]:
    parts = value.split(",")
    if len(parts) != 2:
        raise argparse.ArgumentTypeError("must be X,Y")
    try:
        focus = (float(parts[0]), float(parts[1]))
    except ValueError as error:
        raise argparse.ArgumentTypeError("must be X,Y numeric coordinates") from error
    if any(coordinate < 0.0 or coordinate > 1.0 for coordinate in focus):
        raise argparse.ArgumentTypeError("coordinates must be between 0 and 1")
    return focus


def artifact_id(index: int, source: pathlib.Path) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", source.stem.lower()).strip("-") or "source"
    return f"{index:03d}-{slug}"


def terminal_dimensions(cols: int, rows: int) -> dict[str, int]:
    return {"columns": cols, "rows": rows}


def convert(
    sources: list[pathlib.Path],
    output_dir: pathlib.Path,
    cols: int,
    rows: int,
    fit: str,
    focus: tuple[float, float],
) -> None:
    decision = load_decision()
    chafa_version = require_chafa(decision)
    stops = palette_stops(decision)
    output_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []

    for index, given_source in enumerate(sources, start=1):
        source_path = given_source.expanduser().resolve()
        if not source_path.is_file():
            raise ConversionError(f"source image does not exist: {given_source}")
        try:
            with Image.open(source_path) as opened:
                source = opened.convert("RGB")
        except (OSError, UnidentifiedImageError) as error:
            raise ConversionError(f"cannot read source image {given_source}: {error}") from error

        luma, normalization = normalized_luma(source)
        frame = build_braille_frame(luma, cols, rows, fit, focus, decision, stops)
        item_id = artifact_id(index, source_path)
        plain_path = output_dir / "braille" / f"{item_id}.txt"
        truecolor_path = output_dir / "truecolor" / f"{item_id}.ansi"
        witness_path = output_dir / "witness" / f"{item_id}.png"
        halfblock_path = output_dir / "halfblock" / f"{item_id}.ansi"
        plain_text = "\n".join(braille_rows(frame)) + "\n"
        truecolor_text = "\n".join(braille_rows(frame, truecolor=True)) + "\n"
        halfblock = frame_rgb(source, (cols, rows * 2), fit, focus)
        halfblock_text = "\n".join(halfblock_rows(halfblock)) + "\n"
        write_text(plain_path, plain_text)
        write_text(truecolor_path, truecolor_text)
        write_text(halfblock_path, halfblock_text)
        witness = witness_image(frame)
        save_png(witness_path, witness)

        records.append(
            {
                "id": item_id,
                "input": {
                    "fileName": source_path.name,
                    "sha256": sha256(source_path),
                    "dimensions": {"width": source.width, "height": source.height},
                },
                "normalization": normalization,
                "frame": {
                    "fit": frame.fit,
                    "focus": {"x": focus[0], "y": focus[1]},
                    "dotDimensions": {"width": cols * 2, "height": rows * 4},
                    "cropBox": list(frame.crop_box) if frame.crop_box is not None else None,
                },
                "outputs": {
                    "plainBraille": {
                        "path": plain_path.relative_to(output_dir).as_posix(),
                        "sha256": sha256(plain_path),
                        "dimensions": terminal_dimensions(cols, rows),
                    },
                    "truecolorBraille": {
                        "path": truecolor_path.relative_to(output_dir).as_posix(),
                        "sha256": sha256(truecolor_path),
                        "dimensions": terminal_dimensions(cols, rows),
                    },
                    "truecolorHalfBlock": {
                        "path": halfblock_path.relative_to(output_dir).as_posix(),
                        "sha256": sha256(halfblock_path),
                        "dimensions": terminal_dimensions(cols, rows),
                    },
                    "witnessPng": {
                        "path": witness_path.relative_to(output_dir).as_posix(),
                        "sha256": sha256(witness_path),
                        "dimensions": {"width": witness.width, "height": witness.height},
                    },
                },
            }
        )

    manifest = {
        "schema": "eros-tui/conversion-manifest",
        "version": 1,
        "chafa": {
            "version": chafa_version,
            "pinnedInvocation": decision["invocation"],
        },
        "palette": decision["palette"],
        "terminalGrid": terminal_dimensions(cols, rows),
        "images": records,
    }
    write_json(output_dir / "manifest.json", manifest)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Convert explicit raster sources into EROS Braille and truecolor half-block terminal art."
    )
    parser.add_argument("sources", nargs="+", type=pathlib.Path, metavar="SOURCE", help="explicit source image path")
    parser.add_argument("--output-dir", required=True, type=pathlib.Path, help="directory for emitted terminal artifacts")
    parser.add_argument("--cols", type=parse_positive_int, default=120, help="Braille cell columns (default: 120)")
    parser.add_argument("--rows", type=parse_positive_int, default=40, help="Braille cell rows (default: 40)")
    parser.add_argument("--fit", choices=("contain", "cover"), default="contain", help="framing mode (default: contain)")
    parser.add_argument("--focus", type=parse_focus, default=(0.5, 0.5), metavar="X,Y", help="normalized framing focus (default: 0.5,0.5)")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        convert(args.sources, args.output_dir, args.cols, args.rows, args.fit, args.focus)
    except ConversionError as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
