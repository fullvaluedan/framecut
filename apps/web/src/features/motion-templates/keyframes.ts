/**
 * Keyframe baking for native motion templates: turn a declarative
 * { path: [{atSec, value}...] } spec into real ElementAnimations using the
 * SAME normalization path the keyframe UI uses (resolveAnimationTarget →
 * upsertPathKeyframe), so baked channels are indistinguishable from
 * hand-made ones in the graph editor, preview, and export.
 */

import type {
	AnimationInterpolation,
	AnimationPath,
	ElementAnimations,
} from "@/animation/types";
import { upsertPathKeyframe } from "@/animation/keyframes";
import type { ParamValue } from "@/params";
import type { TimelineElement } from "@/timeline";
import { resolveAnimationTarget } from "@/timeline/animation-targets";
import { mediaTimeFromSeconds } from "@/wasm";

export interface KeySpec {
	atSec: number;
	value: ParamValue;
	interpolation?: AnimationInterpolation;
}

export type TemplateChannels = Partial<Record<AnimationPath, KeySpec[]>>;

/**
 * Bakes the channel spec onto a (not yet inserted) element and returns its
 * ElementAnimations. The element only needs enough shape for param lookup
 * (type + params), so a CreateTimelineElement works.
 */
export function bakeAnimations({
	element,
	channels,
}: {
	element: Omit<TimelineElement, "id">;
	channels: TemplateChannels;
}): ElementAnimations | undefined {
	// resolveAnimationTarget only reads type/params/effects off the element.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	const draft = { ...element, id: "__template_draft__" } as TimelineElement;
	let animations: ElementAnimations | undefined;
	for (const [path, keys] of Object.entries(channels) as [
		AnimationPath,
		KeySpec[],
	][]) {
		const target = resolveAnimationTarget({ element: draft, path });
		if (!target || !keys?.length) continue;
		for (const key of keys) {
			animations = upsertPathKeyframe({
				animations,
				propertyPath: path,
				time: mediaTimeFromSeconds({ seconds: Math.max(0, key.atSec) }),
				value: key.value,
				interpolation: key.interpolation ?? "linear",
				channelLayout: target.channelLayout,
				coerceValue: target.coerceValue,
			});
		}
	}
	return animations;
}

const ENTER_MIN = 0.45;
const ENTER_MAX = 0.9;
/** Entrance/exit as a fraction of clip length, before clamping. */
const ENTER_FRACTION = 0.18;

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(Math.max(v, lo), hi);
}

export interface TimingOverrides {
	enterSec?: number;
	exitSec?: number;
}

/**
 * Entrance/exit seconds, PROPORTIONAL to clip length (so a 1.5s title and a
 * 10s lower-third both feel paced, not rushed), clamped to a sane band and
 * overridable per-template (the Fade controls in Template Controls).
 */
export function resolveEnterExit(
	durationSec: number,
	overrides?: TimingOverrides,
): { enter: number; exit: number } {
	const auto = clamp(durationSec * ENTER_FRACTION, ENTER_MIN, ENTER_MAX);
	const enter =
		overrides?.enterSec !== undefined && overrides.enterSec >= 0
			? overrides.enterSec
			: auto;
	const exit =
		overrides?.exitSec !== undefined && overrides.exitSec >= 0
			? overrides.exitSec
			: auto;
	return { enter, exit };
}

/** Clamp helper: exits land at the end even on very short clips. */
function exitStart(durationSec: number, enter: number, exit: number): number {
	return Math.max(enter + 0.1, durationSec - exit);
}

/** Fade + directional slide in, mirrored out. Offsets in canvas px. */
export function fadeSlide({
	durationSec,
	baseX,
	baseY,
	fromDx = 0,
	fromDy = 0,
	delaySec = 0,
	enterSec,
	exitSec,
}: {
	durationSec: number;
	baseX: number;
	baseY: number;
	fromDx?: number;
	fromDy?: number;
	delaySec?: number;
} & TimingOverrides): TemplateChannels {
	const { enter, exit } = resolveEnterExit(durationSec, { enterSec, exitSec });
	const start = delaySec;
	const settled = delaySec + enter;
	const out = exitStart(durationSec, enter, exit);
	const end = Math.max(out + 0.05, durationSec - 0.05);
	return {
		opacity: [
			{ atSec: start, value: 0 },
			{ atSec: settled, value: 1 },
			{ atSec: out, value: 1 },
			{ atSec: end, value: 0 },
		],
		"transform.positionX": [
			{ atSec: start, value: baseX + fromDx },
			{ atSec: settled, value: baseX },
			{ atSec: out, value: baseX },
			{ atSec: end, value: baseX + fromDx },
		],
		"transform.positionY": [
			{ atSec: start, value: baseY + fromDy },
			{ atSec: settled, value: baseY },
			{ atSec: out, value: baseY },
			{ atSec: end, value: baseY + fromDy },
		],
	};
}

/** Scale overshoot pop (0.8 → 1.06 → 1) + fade, with a fade/scale exit. */
export function popIn({
	durationSec,
	delaySec = 0,
	baseScale = 1,
	enterSec,
	exitSec,
}: {
	durationSec: number;
	delaySec?: number;
	baseScale?: number;
} & TimingOverrides): TemplateChannels {
	const { enter, exit } = resolveEnterExit(durationSec, { enterSec, exitSec });
	const start = delaySec;
	const out = exitStart(durationSec, enter, exit);
	const end = Math.max(out + 0.05, durationSec - 0.05);
	// Overshoot at ~65% of the entrance, settle at ~105% — scaled to `enter`
	// so the pop never outlasts a short clip.
	const peak = start + enter * 0.65;
	const settle = start + enter * 1.05;
	const scaleKeys: KeySpec[] = [
		{ atSec: start, value: 0.8 * baseScale },
		{ atSec: peak, value: 1.06 * baseScale },
		{ atSec: settle, value: 1 * baseScale },
		{ atSec: out, value: 1 * baseScale },
		{ atSec: end, value: 0.94 * baseScale },
	];
	return {
		opacity: [
			{ atSec: start, value: 0 },
			{ atSec: start + enter * 0.5, value: 1 },
			{ atSec: out, value: 1 },
			{ atSec: end, value: 0 },
		],
		"transform.scaleX": scaleKeys,
		"transform.scaleY": scaleKeys.map((k) => ({ ...k })),
	};
}
