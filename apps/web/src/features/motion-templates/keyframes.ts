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

const ENTER_SEC = 0.4;
const EXIT_SEC = 0.4;

/** Clamp helper: exits land at the end even on very short clips. */
function exitStart(durationSec: number): number {
	return Math.max(ENTER_SEC + 0.1, durationSec - EXIT_SEC);
}

/** Fade + directional slide in, mirrored out. Offsets in canvas px. */
export function fadeSlide({
	durationSec,
	baseX,
	baseY,
	fromDx = 0,
	fromDy = 0,
	delaySec = 0,
}: {
	durationSec: number;
	baseX: number;
	baseY: number;
	fromDx?: number;
	fromDy?: number;
	delaySec?: number;
}): TemplateChannels {
	const start = delaySec;
	const settled = delaySec + ENTER_SEC;
	const out = exitStart(durationSec);
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
}: {
	durationSec: number;
	delaySec?: number;
	baseScale?: number;
}): TemplateChannels {
	const start = delaySec;
	const out = exitStart(durationSec);
	const end = Math.max(out + 0.05, durationSec - 0.05);
	const scaleKeys: KeySpec[] = [
		{ atSec: start, value: 0.8 * baseScale },
		{ atSec: start + 0.26, value: 1.06 * baseScale },
		{ atSec: start + 0.42, value: 1 * baseScale },
		{ atSec: out, value: 1 * baseScale },
		{ atSec: end, value: 0.94 * baseScale },
	];
	return {
		opacity: [
			{ atSec: start, value: 0 },
			{ atSec: start + 0.2, value: 1 },
			{ atSec: out, value: 1 },
			{ atSec: end, value: 0 },
		],
		"transform.scaleX": scaleKeys,
		"transform.scaleY": scaleKeys.map((k) => ({ ...k })),
	};
}
