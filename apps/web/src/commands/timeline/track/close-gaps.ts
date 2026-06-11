import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline";
import { rippleShiftElements } from "@/ripple";

interface Gap {
	start: number;
	end: number;
}

/** Gaps on the main track: leading empty space + holes between clips. */
export function findMainTrackGaps({ tracks }: { tracks: SceneTracks }): Gap[] {
	const sorted = [...tracks.main.elements].sort(
		(a, b) => a.startTime - b.startTime,
	);
	const gaps: Gap[] = [];
	let cursor = 0;
	for (const element of sorted) {
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
 * Closes empty gaps on the main track, ripple-shifting every track so
 * overlays and audio stay in sync with the footage.
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
			const gap = findMainTrackGaps({ tracks }).find(
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
				const [gap] = findMainTrackGaps({ tracks });
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
