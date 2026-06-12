import type { ElementRef, SceneTracks, TimelineElement } from "@/timeline";

function allTracks(tracks: SceneTracks) {
	return [...tracks.overlay, tracks.main, ...tracks.audio];
}

function findElement(
	tracks: SceneTracks,
	elementId: string,
): { trackId: string; element: TimelineElement } | null {
	for (const track of allTracks(tracks)) {
		const element = track.elements.find((el) => el.id === elementId);
		if (element) return { trackId: track.id, element };
	}
	return null;
}

function timelineOverlap(a: TimelineElement, b: TimelineElement): boolean {
	return (
		a.startTime < b.startTime + b.duration &&
		a.startTime + a.duration > b.startTime
	);
}

function sourceOverlap(a: TimelineElement, b: TimelineElement): boolean {
	const aStart = a.trimStart;
	const aEnd = a.trimStart + a.duration;
	const bStart = b.trimStart;
	const bEnd = b.trimStart + b.duration;
	return aStart < bEnd && aEnd > bStart;
}

/**
 * Linked partners of an element by shared `linkId`.
 * - `mode:"timeline"` also requires a timeline overlap, so split halves pair
 *   same-side (left↔left) instead of the whole row moving together. Used for
 *   selection/move/trim.
 * - `mode:"source"` requires an overlapping source span, so a partner is still
 *   found after the clips have drifted apart on the timeline. Used for sync
 *   detection.
 */
export function findLinkedPartners({
	ref,
	tracks,
	mode,
}: {
	ref: ElementRef;
	tracks: SceneTracks;
	mode: "timeline" | "source";
}): ElementRef[] {
	const found = findElement(tracks, ref.elementId);
	if (!found?.element.linkId) return [];
	const { element } = found;
	const partners: ElementRef[] = [];
	for (const track of allTracks(tracks)) {
		for (const candidate of track.elements) {
			if (candidate.id === element.id) continue;
			if (candidate.linkId !== element.linkId) continue;
			const ok =
				mode === "timeline"
					? timelineOverlap(element, candidate)
					: sourceOverlap(element, candidate);
			if (ok) partners.push({ trackId: track.id, elementId: candidate.id });
		}
	}
	return partners;
}

/**
 * Expands a selection to include each element's linked partners (timeline
 * mode). Deduplicates. Used by user-interaction selection commits when
 * linked selection is enabled.
 */
export function expandSelectionWithLinks({
	refs,
	tracks,
}: {
	refs: ElementRef[];
	tracks: SceneTracks;
}): ElementRef[] {
	const seen = new Set(refs.map((r) => `${r.trackId}:${r.elementId}`));
	const result = [...refs];
	for (const ref of refs) {
		for (const partner of findLinkedPartners({ ref, tracks, mode: "timeline" })) {
			const key = `${partner.trackId}:${partner.elementId}`;
			if (!seen.has(key)) {
				seen.add(key);
				result.push(partner);
			}
		}
	}
	return result;
}
