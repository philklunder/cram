"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Sprite sheet built by scripts/build-mascot-sprites.py from the two supplied packs.
// Every frame is normalised onto one 360px canvas: the head is scaled to a fixed width,
// then head-centre-x and the feet baseline are pinned. `look-*` therefore never drifts.
//
// Only the speech-bubble frames need a dark variant (their text is baked into the
// raster); the wordless poses are transparent PNGs that read on either theme. `src()`
// falls back to light when no dark file exists.
const CANVAS = 360;
const BODY_FRACTION = 0.5611; // mascot body width / canvas width
const EYE_Y = 0.36; // eye height as a fraction of canvas -- the origin for the look angle
const FEET_Y = 281 / CANVAS; // feet baseline; lets callers align him to a real edge
const HEAD_TOP = 110 / CANVAS; // top of his head; everything above is speech-bubble headroom

const DARK_ONLY = new Set([
  "reading", "done", "brand-1", "brand-2", "brand-3", "brand-4", "brand-5",
  "brand-6", "brand-7", "brand-8", "brand-9", "brand-10",
  "hey-1", "hey-2", "hey-3", "hey-4", "hey-5", "hey-6",
  "tour-1", "tour-2", "tour-3", "tour-4", "tour-5", "tour-6", "tour-7", "tour-8",
  "letsgo-1", "letsgo-2", "letsgo-3", "letsgo-4", "letsgo-5", "letsgo-6",
  "letsgo-7", "letsgo-8",
]);

const src = (name: string, dark: boolean) =>
  `/claude-mascot/${dark && DARK_ONLY.has(name) ? "dark" : "light"}/${name}.png`;

// Eight sprites at 45 deg each. Index 0 is due-east, then counter-clockwise in screen
// space (y grows downward), matching atan2's sign.
const DIRECTIONS = [
  "look-right", "look-up-right", "look-up", "look-up-left",
  "look-left", "look-down-left", "look-down", "look-down-right",
] as const;

const CLICK_FRAMES = ["click-1", "click-2", "click-3", "click-4", "click-5", "click-6"];
const IDLE_FRAMES = ["idle-1", "idle-2", "idle-3", "idle-4", "idle-5"];

// He sits at a laptop and turns your material into cards. Loops while Claude generates;
// `work-done` is the same pose with a green check, so finishing doesn't yank him upright.
const WORK_FRAMES = Array.from({ length: 8 }, (_, i) => `work-${i + 1}`);
const WORK_FPS = 7;

// The packs' speech-bubble frames (brand-*, hey-*, tour-*, letsgo-*, reading, done) bake
// their text into the raster. Measured on the normalised sprite, a capital letter is 3px
// tall out of 360 -- at an 84px mascot it renders 1.2px, and it would take a 471px mascot
// to reach a legible 7px. So the bubble is drawn in HTML instead: crisp at any size,
// theme-aware, translatable, and reachable by a screen reader.
const BUBBLE_TEXT = "Cram AI is powered by Claude";

// Timings lifted from KebeliSamet0/clawd's renderer (MIT-licensed source, not its art).
const CLICK_FPS = 12;
const IDLE_FPS = 10;
const BLINK_MIN_MS = 4200;
const BLINK_MAX_MS = 9000;
const BLINK_MS = 110;

// Hysteresis: the cursor must cross a sector edge by this much before he re-aims, so a
// cursor sitting exactly on a boundary can't flicker between two sprites.
const SECTOR = 360 / 8;
const HYSTERESIS = 7;

// He wakes when the cursor comes within this many multiples of his body width. Set to 0
// for a mascot that stays asleep in dark mode no matter what.
const WAKE_RADIUS = 2.6;
const DEAD_ZONE = 1.15;

// ---------------------------------------------------------------- idle behaviour
// After IDLE_AFTER of a still cursor he starts amusing himself; after DOZE_AFTER he
// gives up and falls asleep. Any pointer movement wakes him straight back to tracking.
// Bits are spaced several seconds apart on purpose -- a mascot that fidgets constantly
// reads as broken, and it pulls the eye away from the page.
const IDLE_AFTER = 5_000;
const DOZE_AFTER = 30_000;
const GAP_MIN = 3_200;
const GAP_MAX = 5_800;

type Bit = { frame: string; ms: number; hop?: boolean };

const BITS: Record<string, { weight: number; timeline: Bit[] }> = {
  // Glances around the page. The most frequent bit because it's the quietest.
  glance: {
    weight: 4,
    timeline: [
      { frame: "look-left", ms: 700 },
      { frame: "look-center", ms: 420 },
      { frame: "look-up-right", ms: 680 },
      { frame: "look-center", ms: 500 },
    ],
  },
  // The pack's own knee-bend loop, played out and back.
  bob: {
    weight: 3,
    timeline: [1, 2, 3, 4, 5, 4, 3, 2, 1].map((i) => ({ frame: `idle-${i}`, ms: 1000 / IDLE_FPS })),
  },
  // A small jump. `excited` is the open-mouthed pose, so it lands on the hop.
  // excited / surprised / look-center / sleep all share the spread-arm pose, so bits that
  // use them stay within that family -- cutting to `happy` mid-bit would pop his arms in.
  hop: {
    weight: 2,
    timeline: [
      { frame: "excited", ms: 560, hop: true },
      { frame: "look-center", ms: 260 },
    ],
  },
  stretch: { weight: 2, timeline: [{ frame: "sleep", ms: 820 }] },
  // Rare: a double-take, as if something moved on the page.
  startle: {
    weight: 1,
    timeline: [
      { frame: "surprised", ms: 260 },
      { frame: "look-center", ms: 200 },
      { frame: "surprised", ms: 200 },
      { frame: "look-center", ms: 460 },
    ],
  },
};

const BIT_POOL = Object.entries(BITS).flatMap(([k, v]) => Array<string>(v.weight).fill(k));

function pickBit(previous: string | null): string {
  const pool = BIT_POOL.filter((b) => b !== previous); // never the same bit twice running
  return pool[Math.floor(Math.random() * pool.length)] ?? "glance";
}

export type MascotMood = "reading" | "done" | "error" | null;

export interface InteractiveClaudeMascotProps {
  className?: string;
  showPoweredByLabel?: boolean;
  /** Mascot body width in px. The rendered box is larger -- it holds the speech bubble. */
  size?: number;
  /** Drive him from an AI generation flow: analysing / finished / failed. */
  mood?: MascotMood;
  /**
   * Which palette he lives on. "auto" follows the `dark` class on <html>.
   * Pass "light" on surfaces that never render dark -- the marketing page has no
   * dark-mode rules at all, so `auto` there would put him to sleep on a white page.
   */
  theme?: "auto" | "light" | "dark";
  /**
   * Collapse the box down to his body. The canvas keeps ~30% headroom above his head for
   * the speech bubble; without a bubble that's just dead space inside a card.
   */
  trim?: boolean;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/** Tracks the `dark` class Cram's ThemeToggle stamps on <html>. */
function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export function InteractiveClaudeMascot({
  className,
  showPoweredByLabel = false,
  size = 88,
  mood: moodProp,
  theme = "auto",
  trim = false,
}: InteractiveClaudeMascotProps) {
  const mood = moodProp ?? null;
  const usesMood = moodProp !== undefined; // caller drives a generation flow -> preload work frames
  const htmlIsDark = useIsDark();
  const isDark = theme === "auto" ? htmlIsDark : theme === "dark";
  const coarse = useMediaQuery("(pointer: coarse)");
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const tracks = !coarse;

  const boxRef = useRef<HTMLDivElement>(null);

  // `look-center` is family B (arms spread) while the eight directional frames are
  // family A (arms tucked). Using it only before the first pointer event means the
  // proportion change never happens mid-track.
  const [frame, setFrame] = useState("look-center");
  const [clicking, setClicking] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [asleep, setAsleep] = useState(false);
  const [bubble, setBubble] = useState(false);

  const [idleFrame, setIdleFrame] = useState<string | null>(null);
  const [hopping, setHopping] = useState(false);
  const [dozing, setDozing] = useState(false);
  // Once the cursor has sat still he stops following it. Staring at a stationary pointer
  // looks broken; he goes neutral and gets on with his own thing.
  const [disengaged, setDisengaged] = useState(false);
  const [workStep, setWorkStep] = useState(0);

  const dirRef = useRef(-1);
  const rafRef = useRef(0);
  const pointer = useRef({ x: 0, y: 0, seen: false });
  const idleTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastBit = useRef<string | null>(null);
  const idleSince = useRef(0);

  const box = Math.round(size / BODY_FRACTION);

  // Dark mode puts him to sleep; he wakes when the cursor comes near.
  const sleepy = isDark && !mood;

  // Asleep for either reason: dark mode, or 30s of a still cursor. Never while a mood is
  // driving him -- he doesn't nap through a generation run.
  const resting = (asleep || dozing) && !mood;

  // ---------------------------------------------------------------- cursor tracking
  const aim = useCallback(() => {
    rafRef.current = 0;
    const el = boxRef.current;
    if (!el || !pointer.current.seen) return;

    const r = el.getBoundingClientRect();
    // The rect is the *box*, which may be trimmed and may be CSS-scaled (the hero shrinks
    // him on mobile). Work back to the sprite canvas so his eyes are the gaze origin.
    const scale = r.width / box;
    const canvasTop = r.top - (trim ? box * HEAD_TOP * scale : 0);
    const ox = r.left + r.width / 2;
    const oy = canvasTop + box * EYE_Y * scale;
    const dx = pointer.current.x - ox;
    const dy = pointer.current.y - oy;
    const dist = Math.hypot(dx, dy);
    const reach = size * scale;

    if (sleepy) {
      const wake = dist < reach * WAKE_RADIUS;
      setAsleep((was) => (was === !wake ? was : !wake));
      if (!wake) return;
    } else {
      setAsleep(false);
    }

    if (dist < reach * DEAD_ZONE) {
      dirRef.current = -1;
      setFrame("happy");
      return;
    }

    // Screen y grows downward, so negate it to get a conventional CCW angle.
    let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;

    const current = dirRef.current;
    let next = Math.round(deg / SECTOR) % 8;
    if (current >= 0 && next !== current) {
      // Only leave the current sector once we're clear of its edge by HYSTERESIS.
      let delta = Math.abs(deg - current * SECTOR);
      if (delta > 180) delta = 360 - delta;
      if (delta < SECTOR / 2 + HYSTERESIS) next = current;
    }
    if (next !== current) {
      dirRef.current = next;
      setFrame(DIRECTIONS[next]);
    }
  }, [size, sleepy, box, trim]);

  // ---------------------------------------------------------------- idle scheduler
  const clearIdle = useCallback(() => {
    for (const t of idleTimers.current) clearTimeout(t);
    idleTimers.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    idleTimers.current.push(setTimeout(fn, ms));
  }, []);

  // Declared as a ref so playBit and armIdle can call each other without a cycle.
  const armIdleRef = useRef<() => void>(() => {});

  const playBit = useCallback(() => {
    if (Date.now() - idleSince.current >= DOZE_AFTER) {
      setIdleFrame(null);
      setDozing(true);
      return; // he stays asleep until the pointer moves
    }

    setDisengaged(true); // stop following a cursor that isn't going anywhere
    const name = pickBit(lastBit.current);
    lastBit.current = name;
    const timeline = BITS[name].timeline;

    let at = 0;
    timeline.forEach((step) => {
      later(() => {
        setIdleFrame(step.frame);
        setHopping(!!step.hop);
      }, at);
      at += step.ms;
    });

    later(() => {
      setIdleFrame(null);
      setHopping(false);
      armIdleRef.current();
    }, at);
  }, [later]);

  const armIdle = useCallback(() => {
    later(playBit, GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN));
  }, [later, playBit]);
  armIdleRef.current = armIdle;

  // A generation run takes him over: drop any half-played idle bit and cancel the nap, so
  // he can't come back from `done` still holding a stale idle frame.
  useEffect(() => {
    if (!mood) return;
    clearIdle();
    setIdleFrame(null);
    setHopping(false);
    setDozing(false);
    setDisengaged(false);
  }, [mood, clearIdle]);

  const wake = useCallback(() => {
    clearIdle();
    idleSince.current = Date.now();
    setIdleFrame(null);
    setHopping(false);
    setDozing(false);
    setDisengaged(false);
    later(playBit, IDLE_AFTER);
  }, [clearIdle, later, playBit]);

  useEffect(() => {
    if (!tracks) return;
    const onMove = (e: PointerEvent) => {
      const moved = pointer.current.x !== e.clientX || pointer.current.y !== e.clientY;
      pointer.current = { x: e.clientX, y: e.clientY, seen: true };
      if (moved && !reduceMotion && !mood) wake();
      if (!rafRef.current) rafRef.current = requestAnimationFrame(aim);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    if (!reduceMotion && !mood) wake(); // arm the first idle timer on mount

    return () => {
      window.removeEventListener("pointermove", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      clearIdle();
    };
    // `wake` is stable enough here; re-arming on every render would reset the countdown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, aim, reduceMotion, mood]);

  // ---------------------------------------------------------------- work loop
  useEffect(() => {
    if (mood !== "reading") return;
    setWorkStep(0);
    if (reduceMotion) return; // hold frame 1 rather than flicker
    const t = setInterval(() => setWorkStep((s) => (s + 1) % WORK_FRAMES.length), 1000 / WORK_FPS);
    return () => clearInterval(t);
  }, [mood, reduceMotion]);

  // ---------------------------------------------------------------- idle loop (touch)
  const [idleStep, setIdleStep] = useState(0);
  useEffect(() => {
    if (tracks || reduceMotion || mood) return;
    const t = setInterval(() => setIdleStep((s) => (s + 1) % IDLE_FRAMES.length), 1000 / IDLE_FPS);
    return () => clearInterval(t);
  }, [tracks, reduceMotion, mood]);

  // In dark mode he is already dozing before the cursor has ever moved.
  useEffect(() => {
    if (sleepy && !pointer.current.seen) setAsleep(true);
    if (!sleepy) setAsleep(false);
  }, [sleepy]);

  // ---------------------------------------------------------------- blink
  // `happy` doubles as the blink frame: its eyes are closed chevrons.
  useEffect(() => {
    if (!tracks || reduceMotion || resting || idleFrame || disengaged || clicking || mood) return;
    let open: ReturnType<typeof setTimeout>;
    let next: ReturnType<typeof setTimeout>;
    const schedule = () => {
      next = setTimeout(() => {
        setFrame("happy");
        open = setTimeout(() => {
          const d = dirRef.current;
          setFrame(d >= 0 ? DIRECTIONS[d] : "look-center");
          schedule();
        }, BLINK_MS);
      }, BLINK_MIN_MS + Math.random() * (BLINK_MAX_MS - BLINK_MIN_MS));
    };
    schedule();
    return () => {
      clearTimeout(next);
      clearTimeout(open);
    };
  }, [tracks, reduceMotion, resting, idleFrame, disengaged, clicking, mood]);

  // ---------------------------------------------------------------- click reaction
  const onClick = useCallback(() => {
    if (clicking || mood) return;
    setClicking(true);
    setAsleep(false);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      if (i >= CLICK_FRAMES.length) {
        clearInterval(t);
        setClicking(false);
        const d = dirRef.current;
        setFrame(d >= 0 ? DIRECTIONS[d] : "look-center");
        return;
      }
      setFrame(CLICK_FRAMES[i]);
    }, 1000 / CLICK_FPS);
    setFrame(CLICK_FRAMES[0]);
  }, [clicking, mood]);

  // ------------------------------------------------- "Cram AI is powered by Claude"
  // Shows once after a beat, and on hover. Suppressed while he's asleep -- a sleeping
  // mascot with a speech bubble reads as broken.
  useEffect(() => {
    if (!showPoweredByLabel || resting || mood) return;
    const show = setTimeout(() => setBubble(true), 1800);
    const hide = setTimeout(() => setBubble(false), 6200);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [showPoweredByLabel, resting, mood]);

  const bubbleOpen = showPoweredByLabel && !resting && !mood && (bubble || hovering);

  // ---------------------------------------------------------------- current sprite
  const current = useMemo(() => {
    // "reading" deliberately doesn't pin a sprite: while Claude works through the PDF he
    // keeps watching your cursor. Only the outcomes take over his face.
    if (mood === "reading") return WORK_FRAMES[workStep]; // heads-down at the laptop
    if (mood === "done") return "work-done";
    if (mood === "error") return "sad";
    if (clicking) return frame;
    if (resting) return "sleep"; // symmetric closed ^^ eyes -- he's dozing
    if (idleFrame) return idleFrame;
    if (bubbleOpen || hovering) return "happy";
    if (!tracks) return IDLE_FRAMES[idleStep];
    if (disengaged) return "look-center"; // idle: he's stopped following the cursor
    return frame;
  }, [mood, workStep, clicking, resting, idleFrame, bubbleOpen, hovering, tracks, idleStep, disengaged, frame]);

  // Preload so a sprite swap never shows a gap.
  useEffect(() => {
    const names = [
      ...DIRECTIONS, ...CLICK_FRAMES, ...IDLE_FRAMES,
      "look-center", "happy", "sad", "excited", "sleep",
    ];
    if (usesMood) names.push(...WORK_FRAMES, "work-done");
    for (const n of names) {
      const img = new Image();
      img.src = src(n, isDark);
    }
  }, [isDark, usesMood]);

  const label =
    mood === "reading" ? "Claude is reading your material"
      : mood === "done" ? "Claude finished your study set"
        : mood === "error" ? "Claude could not read your material"
          : resting ? "Claude is asleep"
            : BUBBLE_TEXT;

  const animate = !reduceMotion;

  return (
    // No `position` in this inline style: an inline value would beat the caller's
    // className (e.g. `fixed bottom-6 right-6`, or the hero's absolute corner).
    <div
      ref={boxRef}
      className={className}
      style={{
        width: box,
        // Trimmed: just his body, from the top of his head to a hair below his feet.
        height: trim ? Math.round(box * (FEET_Y + 0.02 - HEAD_TOP)) : box,
        pointerEvents: "none",
      }}
      data-mascot
    >
      {/* Positioning context for the bubble and the Zzz. The outer box can't provide it:
          its `position` has to stay free for the caller's className. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: box,
          marginTop: trim ? -Math.round(box * HEAD_TOP) : 0,
        }}
      >
      <div
        role="img"
        aria-label={label}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
        onClick={onClick}
        style={{
          position: "relative",   // anchors the Zzz
          width: "100%",
          height: "100%",
          pointerEvents: "auto",
          cursor: "pointer",
          animation: !animate
            ? undefined
            : resting
              ? "cram-mascot-breathe 5s ease-in-out infinite"
              : hopping
                ? "cram-mascot-hop 560ms cubic-bezier(0.3, 0, 0.4, 1)"
                : "cram-mascot-float 3.2s ease-in-out infinite",
          transform: clicking ? "scaleY(0.94) scaleX(1.04)" : undefined,
          transformOrigin: `50% ${FEET_Y * 100}%`,
          transition: "transform 90ms ease-out",
          willChange: "transform",
        }}
      >
        <img
          src={src(current, isDark)}
          alt=""
          width={CANVAS}
          height={CANVAS}
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            imageRendering: "pixelated",
            display: "block",
            userSelect: "none",
          }}
        />

        {resting && animate ? (
          <span aria-hidden style={zzzStyle(box)}>
            z
          </span>
        ) : null}
      </div>

      {showPoweredByLabel ? (
        <div aria-hidden style={bubbleStyle(box, isDark, bubbleOpen, reduceMotion)}>
          {BUBBLE_TEXT}
          <span style={tailStyle(isDark)} />
        </div>
      ) : null}
      </div>

      <style>{KEYFRAMES}</style>
    </div>
  );
}

// Mirrors the pack's bubble: hard 2px ink outline, square corners, a small tail. Drawn in
// HTML so the words stay sharp and legible at an 84px mascot, where the baked-in raster
// text would be 1.2px tall.
const INK_LIGHT = "#17181b";
const INK_DARK = "#f2f2f2";
const FILL_LIGHT = "#ffffff";
const FILL_DARK = "#17181b";

const bubbleStyle = (
  box: number,
  dark: boolean,
  open: boolean,
  reduceMotion: boolean,
): CSSProperties => ({
  position: "absolute",
  // Centred on his head. `transform` is spoken for by the open/close animation, so the
  // centring uses a margin instead of translateX(-50%).
  left: "50%",
  marginLeft: -(box * 0.82) / 2,
  bottom: `${box * 0.72}px`,
  width: box * 0.82,
  padding: "7px 9px",
  border: `2px solid ${dark ? INK_DARK : INK_LIGHT}`,
  borderRadius: 3,
  background: dark ? FILL_DARK : FILL_LIGHT,
  color: dark ? INK_DARK : INK_LIGHT,
  font: "600 10.5px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
  textAlign: "center",
  letterSpacing: "0.01em",
  pointerEvents: "none",
  opacity: open ? 1 : 0,
  transform: open ? "translateY(0) scale(1)" : "translateY(4px) scale(0.94)",
  transformOrigin: "50% 100%",
  transition: reduceMotion ? "opacity 120ms linear" : "opacity 160ms ease-out, transform 160ms ease-out",
  willChange: "opacity, transform",
});

const tailStyle = (dark: boolean): CSSProperties => ({
  position: "absolute",
  left: "calc(50% - 5px)",
  bottom: -7,
  width: 0,
  height: 0,
  borderLeft: "5px solid transparent",
  borderRight: "5px solid transparent",
  borderTop: `7px solid ${dark ? INK_DARK : INK_LIGHT}`,
});

const zzzStyle = (box: number): CSSProperties => ({
  position: "absolute",
  left: "68%",
  top: box * 0.24,
  fontSize: Math.max(11, box * 0.1),
  fontWeight: 700,
  lineHeight: 1,
  color: "currentColor",
  opacity: 0,
  pointerEvents: "none",
  animation: "cram-mascot-zzz 3.4s ease-in-out infinite",
});

const KEYFRAMES = `
@keyframes cram-mascot-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-3px); }
}
/* Translate, never scale. A fractional scale on an image-rendering:pixelated bitmap
   drops pixel rows unevenly and visibly shears him -- and this one runs the whole time
   he's asleep. The hop and the click squash can scale: they're over in under a second. */
@keyframes cram-mascot-breathe {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(2px); }
}
/* Crouch, leap, land, settle -- squash on the ground frames, stretch in the air. */
@keyframes cram-mascot-hop {
  0%   { transform: translateY(0)     scale(1, 1); }
  18%  { transform: translateY(2px)   scale(1.06, 0.94); }
  45%  { transform: translateY(-13px) scale(0.96, 1.05); }
  72%  { transform: translateY(0)     scale(1.05, 0.95); }
  100% { transform: translateY(0)     scale(1, 1); }
}
@keyframes cram-mascot-zzz {
  0%       { opacity: 0; transform: translate(0, 0) scale(0.8); }
  25%      { opacity: 0.75; }
  100%     { opacity: 0; transform: translate(9px, -18px) scale(1.15); }
}
`;
// prefers-reduced-motion is handled in JS (`animate`), not by redefining these keyframes:
// a @keyframes rule inside @media does not reliably override one declared outside it.

export default InteractiveClaudeMascot;
