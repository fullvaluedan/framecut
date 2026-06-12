/**
 * Remove Repeats: transcribes the timeline, asks Claude to find retakes
 * (repeated/restarted sentences), and cuts the abandoned attempts —
 * keeping the last take, like a human editor would.
 */

import { RemoveRangesCommand, type TimeRange } from "@/commands/timeline/track/remove-ranges";
import { ensureTimelineTranscript } from "@/features/transcription/transcript-cache";
import { buildAiAuthHeaders } from "@/features/ai-generate/store";
import { usePreferenceStore } from "@/features/ai-generate/preference-store";
import { TICKS_PER_SECOND } from "@/wasm";
import type { EditorCore } from "@/core";

export async function runRemoveRepeats({
	editor,
	onProgress,
	signal,
	mode = "repeats",
}: {
	editor: EditorCore;
	onProgress?: (detail: string) => void;
	signal?: AbortSignal;
	/** "repeats" = retakes; "cleanup" adds stutters+tangents; "youtube" adds pacing/hook editing. */
	mode?: "repeats" | "cleanup" | "youtube";
}): Promise<{ cuts: number; removedSec: number }> {
	const abortable = <T>(promise: Promise<T>): Promise<T> => {
		if (!signal) return promise;
		return Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				const onAbort = () => reject(new Error("Cancelled"));
				if (signal.aborted) onAbort();
				else signal.addEventListener("abort", onAbort, { once: true });
			}),
		]);
	};
	const totalDuration = editor.timeline.getTotalDuration();
	if (totalDuration / TICKS_PER_SECOND < 2) {
		throw new Error("Add some footage to the timeline first.");
	}

	// One shared pipeline + cache: if the background transcriber already did
	// the work for this exact timeline state, this returns instantly.
	const { segments, fromCache } = await abortable(
		ensureTimelineTranscript({
			editor,
			signal,
			onProgress: (p) => onProgress?.(p.detail),
		}),
	);
	if (fromCache) {
		onProgress?.("Using the cached transcript...");
	}
	if (!segments.length) {
		throw new Error("No speech found — repeats are detected from the transcript.");
	}

	onProgress?.(
		mode === "cleanup"
			? "Claude is planning the cleanup..."
			: "Claude is finding retakes...",
	);
	const res = await fetch("/api/hyperframes/cuts", {
		method: "POST",
		headers: { "content-type": "application/json", ...buildAiAuthHeaders() },
		signal,
		body: JSON.stringify({
			segments,
			mode,
			preferences: usePreferenceStore.getState().buildPreferenceNotes(),
		}),
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

/**
 * The flagship AI Cut: assemble every bin asset onto the timeline, strip
 * silences, then have Claude edit the transcript like a YouTube editor —
 * retakes, stutters, tangents, AND pacing (slow intros, dead weight, weak
 * outros) — using the whole transcript for context.
 */
export async function runYouTubeCut({
	editor,
	onProgress,
	signal,
}: {
	editor: EditorCore;
	onProgress?: (detail: string) => void;
	signal?: AbortSignal;
}): Promise<{ cuts: number; removedSec: number }> {
	onProgress?.("Assembling your footage...");
	const { assembleBinToTimeline } = await import("./assemble");
	assembleBinToTimeline({ editor, assets: editor.media.getAssets() });
	if (signal?.aborted) throw new Error("Cancelled");
	onProgress?.("Removing silences...");
	const { runRemoveSilences } = await import("./remove-silences");
	const silences = await runRemoveSilences({ editor });
	if (signal?.aborted) throw new Error("Cancelled");
	const content = await runRemoveRepeats({
		editor,
		onProgress,
		signal,
		mode: "youtube",
	});
	return {
		cuts: silences.cuts + content.cuts,
		removedSec: silences.removedSec + content.removedSec,
	};
}

/**
 * Full cleanup — Dan's "make it a high-quality video" pass: removes
 * silences first (audio math), then transcribes the tightened timeline and
 * has Claude cut stutters, retakes, and off-topic tangents in one go.
 */
export async function runFullCleanup({
	editor,
	onProgress,
	signal,
}: {
	editor: EditorCore;
	onProgress?: (detail: string) => void;
	signal?: AbortSignal;
}): Promise<{ cuts: number; removedSec: number }> {
	onProgress?.("Removing silences...");
	const { runRemoveSilences } = await import("./remove-silences");
	const silences = await runRemoveSilences({ editor });
	if (signal?.aborted) throw new Error("Cancelled");
	const content = await runRemoveRepeats({
		editor,
		onProgress,
		signal,
		mode: "cleanup",
	});
	return {
		cuts: silences.cuts + content.cuts,
		removedSec: silences.removedSec + content.removedSec,
	};
}
