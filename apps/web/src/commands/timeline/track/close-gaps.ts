import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline";
import { rippleShiftElements } from "@/ripple";

interface Gap {
	start: number;
	end: number;
}

/**
 * Gaps across the whole timeline: intervals (incl. leading space) where NO
 * track — main, overlay, or audio — has any content.
 */
export function findTimelineGaps({ tracks }: { tracks: SceneTracks }): Gap[] {
	const allElements: { startTime: number; duration: number }[] = [
		...tracks.main.elements,
		...tracks.overlay.flatMap((t): { startTime: number; duration: number }[] =>
			t.elements.map((el) => ({ startTime: el.startTime, duration: el.duration })),
		),
		...tracks.audio.flatMap((t) => t.elements),
	].sort((a, b) => a.startTime - b.startTime);
	const gaps: Gap[] = [];
	let cursor = 0;
	for (const element of allElements) {
		if (element.startTime > cursor + 1) {
			gaps.push({ start: cursor, end: element.startTime });
		}
		cursor = Math.max(cursor, element.startTime + element.duration);
	}
	return gaps;
}

function shiftAllTracks({
	tracks,
	gap,
}: {
	tracks: SceneTracks;
	gap: Gap;
}): SceneTracks {
	const shiftAmount = gap.end - gap.start;
	const shift = <T extends { elements: any[] }>(track: T): T => ({
		...track,
		elements: rippleShiftElements({
			elements: track.elements,
			afterTime: gap.end,
			shiftAmount,
		}),
	});
	return {
		...tracks,
		main: shift(tracks.main),
		overlay: tracks.overlay.map(shift),
		audio: tracks.audio.map(shift),
	};
}

/**
 * Closes intervals where no track has content, ripple-shifting every track
 * so footage, overlays, and audio stay in sync.
 *
 * scope "all": closes every gap (including leading space).
 * scope "at-time": closes only the gap containing the given time, if any.
 */
export class CloseGapsCommand extends Command {
	private savedState: SceneTracks | null = null;
	private closedCount = 0;

	constructor(
		private readonly options: { scope: "all" } | { scope: "at-time"; time: number },
	) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;

		let tracks = this.savedState;
		this.closedCount = 0;

		if (this.options.scope === "at-time") {
			const gap = findTimelineGaps({ tracks }).find(
				(g) => this.options.scope === "at-time" &&
					this.options.time >= g.start &&
					this.options.time < g.end,
			);
			if (!gap) return;
			tracks = shiftAllTracks({ tracks, gap });
			this.closedCount = 1;
		} else {
			// Close left to right, recomputing after each shift.
			for (let i = 0; i < 100; i++) {
				const [gap] = findTimelineGaps({ tracks });
				if (!gap) break;
				tracks = shiftAllTracks({ tracks, gap });
				this.closedCount += 1;
			}
			if (this.closedCount === 0) return;
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

	getClosedCount(): number {
		return this.closedCount;
	}
}
