"""Normalise the supplied Claude mascot art into a consistent, theme-aware sprite set.

The two source packs disagree with each other in ways that show up as visible jitter
if the PNGs are used as-is:

  * different canvases (1254px vs 512px) and different head sizes within each,
  * two poses in pack 1 -- the eight directional frames tuck their arms in and carry a
    ~6px skew, while look-center / surprised spread their arms and sit square,
  * pack 1 stores its fully-transparent pixels as *white* (254,254,254,0), so a naive
    resample bleeds a white halo around the character,
  * the speech bubbles bake their text into the raster as black-on-white, which is
    invisible against a dark UI.

So we: premultiplied-alpha resize -> scale each sequence so the head matches a canonical
width -> anchor head-centre-x and feet-baseline onto a shared canvas -> emit light + dark.

Dark variants recolour only bubble ink. The mascot's eyes are the same black as the
bubble text, so black pixels are classified by what surrounds them: black adjacent to
bubble white is ink, black sitting on the orange body is an eye or a mouth.

Usage:
    python scripts/build-mascot-sprites.py --pack1 <dir> --pack2 <dir>
"""

from __future__ import annotations

import argparse
import json
import math

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageMath

# ---------------------------------------------------------------- canonical geometry

# Every frame is scaled so the head is exactly this wide, then pinned by head-centre-x
# and feet-baseline. The canvas size is derived from the union of all frames (the speech
# bubbles overhang the head), and written to manifest.json.
HEAD_W = 132

DARK_FILL = (23, 24, 27)      # bubble interior on dark
DARK_INK = (242, 242, 242)    # bubble outline + text on dark


# ---------------------------------------------------------------- fast channel masks

def _ge(ch: Image.Image, v: int) -> Image.Image:
    return ch.point(lambda p: 255 if p >= v else 0)


def _le(ch: Image.Image, v: int) -> Image.Image:
    return ch.point(lambda p: 255 if p <= v else 0)


def _and(*masks: Image.Image) -> Image.Image:
    out = masks[0]
    for m in masks[1:]:
        out = ImageChops.logical_and(out.convert("1"), m.convert("1")).convert("L")
    return out


def _gt(a: Image.Image, b: Image.Image) -> Image.Image:
    """255 where a > b, channel-wise. Saturating subtract leaves >0 exactly there."""
    return ImageChops.subtract(a, b).point(lambda p: 255 if p > 0 else 0)


def opaque_mask(im: Image.Image) -> Image.Image:
    return _ge(im.split()[3], 128)


def white_mask(im: Image.Image) -> Image.Image:
    r, g, b, _ = im.split()
    return _and(opaque_mask(im), _ge(r, 235), _ge(g, 235), _ge(b, 235))


def black_mask(im: Image.Image) -> Image.Image:
    r, g, b, _ = im.split()
    return _and(opaque_mask(im), _le(r, 70), _le(g, 70), _le(b, 70))


def orange_mask(im: Image.Image) -> Image.Image:
    r, g, b, _ = im.split()
    return _and(
        opaque_mask(im),
        _ge(r, 150), _ge(g, 56), _le(g, 179), _ge(b, 36), _le(b, 149),
        _gt(r, g), _gt(g, b),
    )


def dilate(mask: Image.Image, radius: int) -> Image.Image:
    out = mask
    while radius > 0:
        step = min(radius, 4)          # MaxFilter size must be odd and <= 9
        out = out.filter(ImageFilter.MaxFilter(step * 2 + 1))
        radius -= step
    return out


# ------------------------------------------------- premultiplied-alpha resize

def resize_premultiplied(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Resize without letting pack 1's white-behind-transparent bleed into the edges.

    PIL resamples RGB and A independently, so a (254,254,254,0) pixel next to the body
    drags white into the interpolated edge. Premultiplying pins RGB to zero wherever the
    art is transparent, so only real colour contributes.
    """
    r, g, b, a = im.split()
    pre = Image.merge("RGBA", (
        ImageChops.multiply(r, a),
        ImageChops.multiply(g, a),
        ImageChops.multiply(b, a),
        a,
    )).resize(size, Image.LANCZOS)

    pr, pg, pb, pa = pre.split()
    # ImageMath dispatches on the left operand, so the image has to come first.
    expr = "convert(min(a * 255 / max(alpha, 1), 255), 'L')"
    un = lambda ch: ImageMath.unsafe_eval(expr, a=ch, alpha=pa)  # noqa: E731
    return Image.merge("RGBA", (un(pr), un(pg), un(pb), pa))


# ---------------------------------------------------------------- measurement

FLOOD_KEY = (255, 0, 255)


def key_checkerboard(im: Image.Image) -> Image.Image:
    """Strip the painted transparency checkerboard off the "generating" frames.

    Those PNGs are fully opaque: the checkerboard is real pixels, alternating (254,254,254)
    with (248,248,248). Flooding inward from the border removes it while leaving the white
    cards he produces intact -- they're enclosed by dark outlines, so the flood stops.
    PIL's `thresh` is a *summed* channel difference, so the two checker shades differ by 16
    and anything under that leaves half the board behind.
    """
    rgb = im.convert("RGB")
    w, h = im.size
    for x in range(w):
        for y in (0, h - 1):
            if rgb.getpixel((x, y)) != FLOOD_KEY:
                ImageDraw.floodfill(rgb, (x, y), FLOOD_KEY, thresh=40)
    for y in range(h):
        for x in (0, w - 1):
            if rgb.getpixel((x, y)) != FLOOD_KEY:
                ImageDraw.floodfill(rgb, (x, y), FLOOD_KEY, thresh=40)

    keyed, out = rgb.load(), im.copy()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            if keyed[x, y] == FLOOD_KEY:
                dst[x, y] = (0, 0, 0, 0)
    return out


def measure_tilt(im: Image.Image) -> float:
    """Degrees the character is rotated by, read off the flat top edge of his head.

    Pack 1's eight directional frames plus happy/sad are all rendered at +1.34 deg, while
    look-center and surprised sit square. On blocky pixel art that reads as a broken,
    sheared character the moment you cut between them.
    """
    orange = orange_mask(im)
    x0, y0, x1, y1 = largest_component_bbox(orange)
    cx = (x0 + x1) // 2
    span = int((x1 - x0) * 0.30)
    opx = orange.load()

    def top_y(x: int) -> int | None:
        for y in range(y0, y1):
            if opx[x, y]:
                return y
        return None

    left, right = top_y(cx - span), top_y(cx + span)
    if left is None or right is None or span == 0:
        return 0.0
    return math.degrees(math.atan2(right - left, 2 * span))


def derotate(im: Image.Image, deg: float) -> Image.Image:
    """Rotate the art upright. Done on premultiplied alpha so the white behind pack 1's
    transparent pixels can't smear into the edges."""
    if abs(deg) < 0.3:
        return im
    r, g, b, a = im.split()
    pre = Image.merge("RGBA", (
        ImageChops.multiply(r, a), ImageChops.multiply(g, a), ImageChops.multiply(b, a), a,
    )).rotate(deg, resample=Image.BICUBIC, expand=True)

    pr, pg, pb, pa = pre.split()
    expr = "convert(min(a * 255 / max(alpha, 1), 255), 'L')"
    un = lambda ch: ImageMath.unsafe_eval(expr, a=ch, alpha=pa)  # noqa: E731
    return Image.merge("RGBA", (un(pr), un(pg), un(pb), pa))


@dataclass
class Anchor:
    scale: float
    head_cx: float
    feet_y: float


def largest_component_bbox(mask: Image.Image, step: int = 4) -> tuple[int, int, int, int]:
    """Bbox of the biggest blob in `mask`, found on a `step`-downsampled grid.

    The done / lets-go frames scatter orange confetti around the character; erosion alone
    doesn't remove the fatter squares, and any bbox over the whole mask overshoots badly.
    """
    w, h = mask.size
    sw, sh = w // step, h // step
    small = mask.resize((sw, sh), Image.NEAREST).load()

    seen = bytearray(sw * sh)
    best = (0, None)
    for sy in range(sh):
        for sx in range(sw):
            if not small[sx, sy] or seen[sy * sw + sx]:
                continue
            stack, comp = [(sx, sy)], []
            seen[sy * sw + sx] = 1
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < sw and 0 <= ny < sh and small[nx, ny] and not seen[ny * sw + nx]:
                        seen[ny * sw + nx] = 1
                        stack.append((nx, ny))
            if len(comp) > best[0]:
                best = (len(comp), comp)

    if best[1] is None:
        raise ValueError("no orange body found")
    xs = [p[0] for p in best[1]]
    ys = [p[1] for p in best[1]]
    return min(xs) * step, min(ys) * step, (max(xs) + 1) * step, (max(ys) + 1) * step


def measure(im: Image.Image) -> Anchor:
    """Locate the mascot by its orange body -- never by the alpha bbox, because on the
    bubble frames the topmost opaque thing is the speech bubble, not the head."""
    orange = orange_mask(im)
    x0, y0, x1, y1 = largest_component_bbox(orange)
    cx = (x0 + x1) // 2
    row = y0 + max(2, int((y1 - y0) * 0.08))             # in the head band, above the arms
    opx = orange.load()
    if not opx[cx, row]:
        raise ValueError("head row missed the body")

    # Walk out from the centre so a stray sparkle on the same scanline can't widen it.
    left = cx
    while left > 0 and opx[left - 1, row]:
        left -= 1
    right = cx
    while right < im.size[0] - 1 and opx[right + 1, row]:
        right += 1

    head_w = right - left + 1
    return Anchor(HEAD_W / head_w, (left + right) / 2, float(y1))


def scale_frame(im: Image.Image, anchor: Anchor) -> tuple[Image.Image, int, int]:
    """Scale a frame and return it with the anchor point (head centre x, feet y) in
    the scaled frame's own coordinates."""
    w, h = im.size
    nw, nh = max(1, round(w * anchor.scale)), max(1, round(h * anchor.scale))
    scaled = resize_premultiplied(im, (nw, nh))
    return scaled, round(anchor.head_cx * anchor.scale), round(anchor.feet_y * anchor.scale)


def frame_extent(scaled: Image.Image, ax: int, ay: int) -> tuple[int, int, int, int]:
    """Alpha bbox of a scaled frame, expressed relative to its anchor point."""
    bb = scaled.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    if bb is None:
        return 0, 0, 0, 0
    return bb[0] - ax, bb[1] - ay, bb[2] - ax, bb[3] - ay


def compose(scaled: Image.Image, ax: int, ay: int,
            canvas: int, anchor_x: int, anchor_y: int) -> Image.Image:
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(scaled, (anchor_x - ax, anchor_y - ay), scaled)
    return out


# ---------------------------------------------------------------- dark variant

def to_dark(im: Image.Image) -> tuple[Image.Image, bool]:
    """Recolour bubble ink for dark UIs. Returns (image, changed)."""
    # Opening: resampling leaves a few near-white specks in the gaps between his legs,
    # and those must not be mistaken for a speech bubble's interior.
    white = white_mask(im).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    black = black_mask(im)
    if white.getbbox() is None and black.getbbox() is None:
        return im, False

    near_white = dilate(white, 4)
    # Wide enough to reach the *centre* of an eye or a mouth from the surrounding body --
    # a 1px dilation only catches their outline, and the interiors would flip to white.
    # near_white is tested first, so a bubble tail touching the head still reads as ink.
    near_orange = dilate(orange_mask(im), 12)

    out = im.copy()
    src, dst = im.load(), out.load()
    wpx, opx, bpx, npx = white.load(), near_orange.load(), black.load(), near_white.load()
    w, h = im.size
    changed = False
    for y in range(h):
        for x in range(w):
            if wpx[x, y]:                       # bubble interior
                dst[x, y] = (*DARK_FILL, src[x, y][3])
                changed = True
            elif bpx[x, y]:
                if npx[x, y]:                   # bubble outline / bubble text
                    dst[x, y] = (*DARK_INK, src[x, y][3])
                    changed = True
                elif opx[x, y]:                 # eyes, mouth -> leave black
                    pass
                else:                           # "Powered by Claude" wordmark
                    dst[x, y] = (*DARK_INK, src[x, y][3])
                    changed = True
    return out, changed


# ---------------------------------------------------------------- sprite plan

def plan(p1: Path, p2: Path, gen: Path | None) -> list[tuple[str, Path, str]]:
    ct, em = p1 / "cursor-tracking", p1 / "emotions"
    e2, idle = p2 / "emotions-no-glow", p2 / "idle-knees"
    click = p2 / "click-walkthrough" / "01-click-reaction"
    hey = p2 / "click-walkthrough" / "02-hey"
    tour = p2 / "click-walkthrough" / "03-need-a-tour"
    lets = p2 / "click-walkthrough" / "04-lets-go"
    brand = p2 / "branding-ai-from-claude"

    # Frames sharing a sequence key share one anchor, which preserves the bob/squash
    # *inside* a sequence while still aligning sequences to each other.
    items: list[tuple[str, Path, str]] = []

    for n in ["look-up-left", "look-up", "look-up-right", "look-left",
              "look-right", "look-down-left", "look-down", "look-down-right"]:
        items.append((n, ct / f"{n}.png", "dir"))           # family A: tucked arms
    items.append(("look-center", ct / "look-center.png", "center"))

    items.append(("happy", em / "happy.png", "dir"))        # family A -> no arm pop on hover
    items.append(("sad", em / "sad.png", "dir"))
    items.append(("surprised", em / "surprised.png", "center"))
    items.append(("excited", e2 / "excited-no-glow.png", "p2emo"))
    # Pack 1's happy has an asymmetric face (one eye higher, mouth off-centre). Fine for a
    # 110ms blink, wrong for a face he holds for a whole nap -- pack 2's is symmetric.
    items.append(("sleep", e2 / "happy-no-glow.png", "p2emo"))

    # idle-knees ships 16 files but only 5 are distinct images.
    for out_i, src_i in enumerate([1, 2, 3, 10, 11], start=1):
        items.append((f"idle-{out_i}", idle / f"idle-knees-frame-{src_i:02d}.png", "idle"))

    for i in range(1, 7):
        items.append((f"click-{i}", click / f"click-reaction-frame-{i:02d}.png", "click"))
    for i in range(1, 7):
        items.append((f"hey-{i}", hey / f"hey-frame-{i:02d}.png", "hey"))
    for i in range(1, 9):
        items.append((f"tour-{i}", tour / f"need-a-tour-frame-{i:02d}.png", "tour"))
    for i in range(1, 9):
        items.append((f"letsgo-{i}", lets / f"lets-go-frame-{i:02d}.png", "letsgo"))
    for i in range(1, 11):
        items.append((f"brand-{i}", brand / f"ai-powered-by-claude-frame-{i:02d}.png", "brand"))

    items.append(("reading", p1 / "loading" / "reading-your-notes.png", "reading"))
    items.append(("done", p1 / "completion" / "done-confetti-powered-by-claude.png", "done"))

    if gen is not None:
        # "Generating" pack: he sits at a laptop and produces cards. Files are named
        # "ChatGPT Image ... (N).png"; N is the frame order. Frame 9 is skipped -- it bakes
        # a "Done!" bubble into the raster, which is unreadable at this size.
        by_index = {
            int(f.name.split("(")[1].split(")")[0]): f
            for f in gen.glob("*.png") if "(" in f.name
        }
        for i in range(1, 9):
            items.append((f"work-{i}", by_index[i], "work"))
        items.append(("work-done", by_index[10], "work"))

    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack1", required=True, type=Path)
    ap.add_argument("--pack2", required=True, type=Path)
    ap.add_argument("--gen", type=Path, help="the 'generating' laptop frames")
    ap.add_argument("--out", type=Path, default=Path("public/claude-mascot"))
    args = ap.parse_args()

    items = plan(args.pack1, args.pack2, args.gen)
    missing = [str(s) for _, s, _ in items if not s.exists()]
    if missing:
        raise SystemExit("missing sources:\n  " + "\n  ".join(missing))

    # Clear stale PNGs rather than rmtree'ing: OneDrive keeps a handle on the folder.
    for sub in ("light", "dark"):
        d = args.out / sub
        d.mkdir(parents=True, exist_ok=True)
        for old in d.glob("*.png"):
            old.unlink()

    anchors: dict[str, Anchor] = {}
    tilts: dict[str, float] = {}
    dark_names: list[str] = []

    # Pass 1 -- scale every frame and record how far it reaches from its anchor. The
    # speech bubbles overhang the head by a lot, so the canvas has to be sized to the
    # union of all frames or they get clipped at the corner.
    print("measuring...")
    scaled: dict[str, tuple[Image.Image, int, int]] = {}
    lo_x = lo_y = hi_x = hi_y = 0
    for name, src, seq in items:
        im = Image.open(src).convert("RGBA")
        if seq == "work":
            im = key_checkerboard(im)          # these ship with a painted checkerboard
        if seq not in tilts:                   # first frame of a sequence defines it
            tilts[seq] = measure_tilt(im)
            if abs(tilts[seq]) >= 0.3:
                print(f"  de-rotating {seq:8} by {-tilts[seq]:+.2f} deg")
        im = derotate(im, tilts[seq])
        if seq not in anchors:
            anchors[seq] = measure(im)         # measured on the upright art
        s, ax, ay = scale_frame(im, anchors[seq])
        scaled[name] = (s, ax, ay)
        x0, y0, x1, y1 = frame_extent(s, ax, ay)
        lo_x, lo_y = min(lo_x, x0), min(lo_y, y0)
        hi_x, hi_y = max(hi_x, x1), max(hi_y, y1)

    pad = 4
    anchor_x = -lo_x + pad
    anchor_y = -lo_y + pad
    canvas = max(hi_x - lo_x, hi_y - lo_y) + pad * 2
    canvas += canvas % 2
    print(f"canvas={canvas}  anchor=({anchor_x},{anchor_y})  "
          f"extent x[{lo_x},{hi_x}] y[{lo_y},{hi_y}]\n")

    # Pass 2 -- compose onto the shared canvas.
    composed: dict[str, Image.Image] = {}
    for name, _, _ in items:
        s, ax, ay = scaled[name]
        norm = compose(s, ax, ay, canvas, anchor_x, anchor_y)
        composed[name] = norm

        norm.save(args.out / "light" / f"{name}.png", optimize=True)
        # The work frames' white rectangles are paper cards he's producing, not speech
        # bubbles -- recolouring them would turn his output black on a dark UI.
        dark, changed = (norm, False) if name.startswith("work") else to_dark(norm)
        if changed:
            dark.save(args.out / "dark" / f"{name}.png", optimize=True)
            dark_names.append(name)
        print(f"  {name:14} {'light+dark' if changed else 'light'}")

    # The caller's `size` is the mascot's body width, not the canvas width -- the canvas
    # carries the speech-bubble overhang too. Measure the body on a real composed frame.
    ref = largest_component_bbox(orange_mask(composed["look-center"]), step=2)
    body_w = ref[2] - ref[0]

    (args.out / "manifest.json").write_text(json.dumps({
        "canvas": canvas,
        "bodyWidth": body_w,
        "bodyFraction": round(body_w / canvas, 5),
        "anchor": {"x": anchor_x, "y": anchor_y},
        "hasDarkVariant": sorted(dark_names),
    }, indent=2) + "\n")
    print(f"\ncanvas={canvas} bodyWidth={body_w} bodyFraction={body_w / canvas:.4f}")
    print(f"{len(items)} sprites, {len(dark_names)} with dark variants -> {args.out}")


if __name__ == "__main__":
    main()
