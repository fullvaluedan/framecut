import type { ElementAnimations } from "@/animation/types";

/**
 * Motion-template resize behavior: entrance keyframes stay pinned to the
 * element's START, exit keyframes follow the element's END. Keys in the
 * first half of the OLD duration are treated as entrance, the rest as exit
 * and shifted by the duration delta. Works on raw channel data so user
 * tweaks to values/easing survive — only the timing of the tail moves.
 */
export function retimeTemplateAnimations({
	animations,
	oldDuration,
	newDuration,
}: {
	animations: ElementAnimations | undefined;
	oldDuration: number;
	newDuration: number;
}): ElementAnimations | undefined {
	if (
		!animations ||
		oldDuration <= 0 ||
		newDuration <= 0 ||
		oldDuration === newDuration
	) {
		return animations;
	}
	const pivot = oldDuration / 2;
	const shift = newDuration - oldDuration;
	const retime = (time: number): number => {
		const next = time > pivot ? time + shift : time;
		return Math.max(0, Math.min(newDuration, next));
	};
	const out: ElementAnimations = {};
	for (const [path, data] of Object.entries(animations)) {
		if (data === undefined) continue;
		out[path] = retimeChannelValue(data, retime) as typeof data;
	}
	return out;
}

function retimeChannelValue(
	value: unknown,
	retime: (time: number) => number,
): unknown {
	if (!value || typeof value !== "object") return value;
	const maybeChannel = value as { keys?: unknown };
	if (Array.isArray(maybeChannel.keys)) {
		const keys = (maybeChannel.keys as { time: number }[])
			.map((key) => ({ ...key, time: retime(key.time) }))
			.sort((a, b) => a.time - b.time);
		return { ...value, keys };
	}
	const out: Record<string, unknown> = {};
	for (const [key, nested] of Object.entries(value)) {
		out[key] = retimeChannelValue(nested, retime);
	}
	return out;
}
