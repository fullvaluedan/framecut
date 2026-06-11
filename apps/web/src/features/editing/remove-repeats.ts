/**
 * Remove Repeats: transcribes the timeline, asks Claude to find retakes
 * (repeated/restarted sentences), and cuts the abandoned attempts —
 * keeping the last take, like a human editor would.
 */

import { RemoveRangesCommand, type TimeRange } from "@/commands/timeline/track/remove-ranges";
import { decodeAudioToFloat32 } from "@/media/audio";
import { extractTimelineAudio } from "@/media/mediabunny";
import { transcriptionService } from "@/services/transcription/service";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { buildAiAuthHeaders } from "@/features/ai-generate/store";
import { TICKS_PER_SECOND } from "@/wasm";
import type { EditorCore } from "@/core";

export async function runRemoveRepeats({
	editor,
	onProgress,
}: {
	editor: EditorCore;
	onProgress?: (detail: string) => void;
}): Promise<{ cuts: number; removedSec: number }> {
	const totalDuration = editor.timeline.getTotalDuration();
	if (totalDuration / TICKS_PER_SECOND < 2) {
		throw new Error("Add some footage to the timeline first.");
	}

	onProgress?.("Listening to your video...");
	const audioBlob = await extractTimelineAudio({
		tracks: editor.scenes.getActiveScene().tracks,
		mediaAssets: editor.media.getAssets(),
		totalDuration,
	});
	const { samples } = await decodeAudioToFloat32({
		audioBlob,
		sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
	});
	const transcript = await transcriptionService.transcribe({
		audioData: samples,
		onProgress: (p) => {
			if (p.status === "loading-model") {
				onProgress?.(`Downloading speech model: ${Math.round(p.progress)}%`);
			}
		},
	});
	if (!transcript.segments.length) {
		throw new Error("No speech found — repeats are detected from the transcript.");
	}

	onProgress?.("Claude is finding retakes...");
	const res = await fetch("/api/hyperframes/cuts", {
		method: "POST",
		headers: { "content-type": "application/json", ...buildAiAuthHeaders() },
		body: JSON.stringify({ segments: transcript.segments }),
	});
	if (!res.ok) {
		const err = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(err?.error ?? `Cut planning failed (${res.status})`);
	}
	const { cuts } = (await res.json()) as {
		cuts: { startSec: number; endSec: number; reason: string }[];
	};
	if (!cuts.length) {
		return { cuts: 0, removedSec: 0 };
	}

	const ranges: TimeRange[] = cuts.map((c) => ({
		start: Math.round(c.startSec * TICKS_PER_SECOND),
		end: Math.round(c.endSec * TICKS_PER_SECOND),
	}));
	const command = new RemoveRangesCommand({ ranges });
	editor.command.execute({ command });
	return {
		cuts: cuts.length,
		removedSec: cuts.reduce((acc, c) => acc + (c.endSec - c.startSec), 0),
	};
}
