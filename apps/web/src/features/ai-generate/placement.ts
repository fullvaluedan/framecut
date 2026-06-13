import type { EditorCore } from "@/core";
import { AddTrackCommand } from "@/commands";

/**
 * Placement lanes: one per AI overlay track. Each effect goes on the first
 * lane whose time span is free; a new track is created when every lane is
 * occupied. This guarantees inserts can never be rejected for overlapping —
 * the silent-failure mode where assets landed in the bin but not on the
 * timeline (e.g. re-running on the same footage).
 *
 * Shared by RUN HYPERFRAMES (batch placement) and the bake library
 * (single-block drop) so both pack onto AI lanes identically.
 */
export interface PlacementLane {
	trackId: string;
	addCommand: AddTrackCommand | null;
	occupied: Array<{ start: number; end: number }>;
}

export function buildAiLanes(editor: EditorCore): PlacementLane[] {
	const tracks = editor.scenes.getActiveScene().tracks;
	return tracks.overlay
		.filter(
			(t) =>
				t.type === "video" &&
				t.elements.length > 0 &&
				t.elements.every((el) => el.type === "video" && el.framecutAi),
		)
		.map((t) => ({
			trackId: t.id,
			addCommand: null,
			occupied: t.elements.map((el) => ({
				start: el.startTime,
				end: el.startTime + el.duration,
			})),
		}));
}

export function claimLane({
	lanes,
	start,
	end,
}: {
	lanes: PlacementLane[];
	start: number;
	end: number;
}): PlacementLane {
	let lane = lanes.find(
		(l) => !l.occupied.some((o) => start < o.end && end > o.start),
	);
	if (!lane) {
		const addCommand = new AddTrackCommand({ type: "video", index: 0 });
		lane = { trackId: addCommand.getTrackId(), addCommand, occupied: [] };
		lanes.push(lane);
	}
	lane.occupied.push({ start, end });
	return lane;
}
