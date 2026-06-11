/**
 * VibeCut media insertion: Premiere-style behavior where adding a video with
 * audio also separates its audio onto an audio track (waveform visible).
 */

import { InsertElementCommand } from "@/commands/timeline/element/insert-element";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { buildElementFromMedia } from "@/timeline/element-utils";
import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import { mediaTimeFromSeconds, type MediaTime } from "@/wasm";

type Placement =
	| { mode: "explicit"; trackId: string }
	| { mode: "auto"; trackType?: "video" | "text" | "audio" | "graphic" | "effect"; insertIndex?: number };

export function insertMediaAsset({
	editor,
	asset,
	startTime,
	placement = { mode: "auto" },
	separateAudio = true,
}: {
	editor: EditorCore;
	asset: MediaAsset;
	startTime: MediaTime;
	placement?: Placement;
	separateAudio?: boolean;
}): { elementId: string | null; trackId: string | null } {
	const duration =
		asset.duration != null
			? mediaTimeFromSeconds({ seconds: asset.duration })
			: DEFAULT_NEW_ELEMENT_DURATION;
	const element = buildElementFromMedia({
		mediaId: asset.id,
		mediaType: asset.type,
		name: asset.name,
		duration,
		startTime,
	});
	const command = new InsertElementCommand({ element, placement });
	editor.command.execute({ command });
	const elementId = command.getElementId() ?? null;
	const trackId = command.getTrackId() ?? null;

	if (
		separateAudio &&
		asset.type === "video" &&
		asset.hasAudio !== false &&
		elementId &&
		trackId
	) {
		editor.timeline.toggleSourceAudioSeparation({ trackId, elementId });
	}

	return { elementId, trackId };
}
