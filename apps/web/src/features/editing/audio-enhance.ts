/**
 * One-click audio leveling, Premiere-style ("Enhance Speech" lite):
 * - enhanceClipAudio: measures a clip's loudness from its source file and
 *   sets the clip volume (dB) so speech lands at a dialog target.
 * - balanceTimelineAudio: does that for every audio-bearing clip at once,
 *   so all clips play at a consistent loudness. Single undo step.
 *
 * Measurement is a gated RMS: 50ms windows, ignoring near-silence, so
 * pauses don't drag the average down. All math happens on the raw source
 * audio — the resulting volume is absolute, so re-running is a no-op.
 */

import { toast } from "sonner";
import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import type { TimelineElement } from "@/timeline";
import { decodeAudioToFloat32 } from "@/media/audio";
import { BatchCommand } from "@/commands";
import { UpdateElementsCommand } from "@/commands/timeline/element/update-elements";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "@/timeline/audio-constants";

/** Loudness target for spoken content, in dBFS (gated RMS). */
const TARGET_DB = -16;
const WINDOW_MS = 50;
const GATE_DB = -45;
const ANALYSIS_SAMPLE_RATE = 16000;

async function measureGatedRmsDb(asset: MediaAsset): Promise<number | null> {
	const { samples } = await decodeAudioToFloat32({
		audioBlob: asset.file,
		sampleRate: ANALYSIS_SAMPLE_RATE,
	});
	if (!samples.length) return null;
	const windowSize = Math.floor((ANALYSIS_SAMPLE_RATE * WINDOW_MS) / 1000);
	const gateLinear = 10 ** (GATE_DB / 20);
	let sumSquares = 0;
	let counted = 0;
	for (let start = 0; start + windowSize <= samples.length; start += windowSize) {
		let windowSum = 0;
		for (let i = start; i < start + windowSize; i++) {
			windowSum += samples[i] * samples[i];
		}
		const windowRms = Math.sqrt(windowSum / windowSize);
		if (windowRms >= gateLinear) {
			sumSquares += windowSum;
			counted += windowSize;
		}
	}
	if (!counted) return null;
	return 20 * Math.log10(Math.sqrt(sumSquares / counted));
}

function clampDb(value: number): number {
	return Math.min(VOLUME_DB_MAX, Math.max(VOLUME_DB_MIN, Math.round(value * 10) / 10));
}

interface AudioTarget {
	trackId: string;
	element: TimelineElement;
	asset: MediaAsset;
}

/** Every clip on the timeline that plays audio from a media asset. */
function collectAudioTargets(editor: EditorCore): AudioTarget[] {
	const tracks = editor.scenes.getActiveScene().tracks;
	const assets = editor.media.getAssets();
	const targets: AudioTarget[] = [];
	const visit = (trackId: string, elements: readonly TimelineElement[]) => {
		for (const el of elements) {
			if (!("mediaId" in el) || !el.mediaId) continue;
			if (el.type !== "video" && el.type !== "audio") continue;
			if (el.type === "video" && el.isSourceAudioEnabled === false) continue;
			const asset = assets.find((a) => a.id === el.mediaId);
			if (!asset || asset.hasAudio === false) continue;
			targets.push({ trackId, element: el, asset });
		}
	};
	visit(tracks.main.id, tracks.main.elements);
	for (const t of tracks.overlay) visit(t.id, t.elements as TimelineElement[]);
	for (const t of tracks.audio) visit(t.id, t.elements as TimelineElement[]);
	return targets;
}

function buildVolumePatch(element: TimelineElement, volumeDb: number) {
	const params = "params" in element ? element.params : {};
	return { params: { ...params, volume: volumeDb } };
}

/** Sets one clip's volume so its speech hits the dialog loudness target. */
export async function enhanceClipAudio({
	editor,
	trackId,
	element,
}: {
	editor: EditorCore;
	trackId: string;
	element: TimelineElement;
}): Promise<{ volumeDb: number }> {
	if (!("mediaId" in element) || !element.mediaId) {
		throw new Error("This clip has no source audio to enhance.");
	}
	const asset = editor.media.getAssets().find((a) => a.id === element.mediaId);
	if (!asset) throw new Error("Source media not found.");
	const measuredDb = await measureGatedRmsDb(asset);
	if (measuredDb === null) {
		throw new Error("No audible audio found in this clip's source.");
	}
	const volumeDb = clampDb(TARGET_DB - measuredDb);
	editor.command.execute({
		command: new UpdateElementsCommand({
			updates: [
				{
					trackId,
					elementId: element.id,
					patch: buildVolumePatch(element, volumeDb),
				},
			],
		}),
	});
	return { volumeDb };
}

/**
 * Levels every audio-bearing clip on the timeline to the same loudness
 * target. One undo restores all previous volumes.
 */
export async function balanceTimelineAudio({
	editor,
	onProgress,
}: {
	editor: EditorCore;
	onProgress?: (done: number, total: number) => void;
}): Promise<{ adjusted: number }> {
	const targets = collectAudioTargets(editor);
	if (!targets.length) {
		throw new Error("No clips with audio on the timeline.");
	}
	// Measure each unique asset once (clips cut from the same source share it).
	const byAsset = new Map<string, number | null>();
	let done = 0;
	for (const target of targets) {
		if (!byAsset.has(target.asset.id)) {
			byAsset.set(target.asset.id, await measureGatedRmsDb(target.asset));
		}
		done += 1;
		onProgress?.(done, targets.length);
	}
	const commands = targets.flatMap((target) => {
		const measured = byAsset.get(target.asset.id);
		if (measured === null || measured === undefined) return [];
		return [
			new UpdateElementsCommand({
				updates: [
					{
						trackId: target.trackId,
						elementId: target.element.id,
						patch: buildVolumePatch(target.element, clampDb(TARGET_DB - measured)),
					},
				],
			}),
		];
	});
	if (!commands.length) {
		throw new Error("No audible audio found in any clip.");
	}
	editor.command.execute({ command: new BatchCommand(commands) });
	return { adjusted: commands.length };
}

export const showEnhanceError = (e: unknown, title: string) =>
	toast.error(title, {
		description: e instanceof Error ? e.message : String(e),
	});
