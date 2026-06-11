/**
 * Assemble: lay every (non-ephemeral) bin asset onto the timeline
 * back-to-back, in the bin's current sort order, starting after any
 * existing main-track content — turning the project into one video.
 */

import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import { TICKS_PER_SECOND, mediaTimeFromSeconds } from "@/wasm";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { insertMediaAsset } from "./insert-media";

export function assembleBinToTimeline({
	editor,
	assets,
}: {
	editor: EditorCore;
	assets: MediaAsset[];
}): { added: number; skipped: number } {
	const usable = assets.filter((a) => !a.ephemeral);
	if (!usable.length) {
		return { added: 0, skipped: 0 };
	}

	const tracks = editor.scenes.getActiveScene().tracks;
	const mainTrackId = tracks.main.id;
	let cursorSec = tracks.main.elements.reduce(
		(end, el) => Math.max(end, (el.startTime + el.duration) / TICKS_PER_SECOND),
		0,
	);

	let added = 0;
	let skipped = 0;
	for (const asset of usable) {
		const durationSec =
			asset.duration ?? DEFAULT_NEW_ELEMENT_DURATION / TICKS_PER_SECOND;
		const startTime = mediaTimeFromSeconds({ seconds: cursorSec });
		const placement =
			asset.type === "audio"
				? ({ mode: "auto" } as const)
				: ({ mode: "explicit", trackId: mainTrackId } as const);
		const { elementId } = insertMediaAsset({
			editor,
			asset,
			startTime,
			placement,
		});
		if (elementId) {
			added += 1;
			cursorSec += durationSec;
		} else {
			skipped += 1;
		}
	}

	return { added, skipped };
}
