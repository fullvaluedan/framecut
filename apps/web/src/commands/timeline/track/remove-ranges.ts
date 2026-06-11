import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline";
import { generateUUID } from "@/utils/id";

export interface TimeRange {
	/** ticks */
	start: number;
	/** ticks */
	end: number;
}

function cutElement({
	element,
	range,
}: {
	element: TimelineElement;
	range: TimeRange;
}): TimelineElement[] {
	const start = element.startTime;
	const end = element.startTime + element.duration;
	const cutLen = range.end - range.start;

	// Entirely before the cut — untouched.
	if (end <= range.start) return [element];
	// Entirely after — shift left.
	if (start >= range.end) {
		return [{ ...element, startTime: start - cutLen } as TimelineElement];
	}
	// Entirely inside — removed.
	if (start >= range.start && end <= range.end) return [];

	const pieces: TimelineElement[] = [];
	// Left remainder.
	if (start < range.start) {
		pieces.push({
			...element,
			duration: range.start - start,
		} as TimelineElement);
	}
	// Right remainder: keeps source continuity via trimStart, lands at the cut point.
	if (end > range.end) {
		const consumedFromSource = range.end - start;
		pieces.push({
			...element,
			id: start < range.start ? generateUUID() : element.id,
			startTime: range.start,
			duration: end - range.end,
			trimStart: element.trimStart + consumedFromSource,
		} as TimelineElement);
	}
	return pieces;
}

function cutTrack<T extends TimelineTrack>({
	track,
	range,
}: {
	track: T;
	range: TimeRange;
}): T {
	return {
		...track,
		elements: track.elements.flatMap((element) =>
			cutElement({ element, range }),
		),
	};
}

/**
 * Removes time ranges from the whole timeline: content inside each range is
 * deleted (elements split where they straddle a boundary) and everything
 * after slides left — across main, overlay, and audio tracks. Powers
 * Remove Silences / Remove Repeats / Autocut.
 */
export class RemoveRangesCommand extends Command {
	private savedState: SceneTracks | null = null;
	private removedCount = 0;

	constructor(private readonly options: { ranges: TimeRange[] }) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;

		// Sort descending so earlier ranges stay valid while we cut.
		const ranges = [...this.options.ranges]
			.filter((r) => r.end > r.start)
			.sort((a, b) => b.start - a.start);
		if (!ranges.length) return;

		let tracks = this.savedState;
		for (const range of ranges) {
			tracks = {
				...tracks,
				main: cutTrack({ track: tracks.main, range }),
				overlay: tracks.overlay.map((t) => cutTrack({ track: t, range })),
				audio: tracks.audio.map((t) => cutTrack({ track: t, range })),
			};
			this.removedCount += 1;
		}

		editor.timeline.updateTracks(tracks);
		return undefined;
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}

	getRemovedCount(): number {
		return this.removedCount;
	}
}
