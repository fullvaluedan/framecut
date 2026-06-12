/**
 * One transcript, used everywhere. The timeline's audio content is hashed
 * (asset ids + placement + trims); the transcript for that exact state is
 * cached on this device and shared by AI CUT, RUN HYPERFRAMES, and the
 * background transcriber that kicks in whenever the timeline changes.
 */

import { create } from "zustand";
import type { EditorCore } from "@/core";
import { decodeAudioToFloat32 } from "@/media/audio";
import { extractTimelineAudio } from "@/media/mediabunny";
import { transcriptionService } from "@/services/transcription/service";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { TICKS_PER_SECOND } from "@/wasm";

export interface TranscriptSegmentLite {
	start: number;
	end: number;
	text: string;
}

export interface TranscribeProgress {
	phase: "extracting" | "downloading-model" | "initializing-model" | "transcribing";
	detail: string;
	/** 0..1 where known (model download). */
	progress?: number;
}

interface CacheEntry {
	hash: string;
	segments: TranscriptSegmentLite[];
	createdAt: number;
}

const CACHE_KEY = "vibecut-transcript-cache";
const MAX_PROJECT_ENTRIES = 6;

interface TranscriptStatusStore {
	status: "idle" | "transcribing" | "ready" | "error";
	setStatus: (status: TranscriptStatusStore["status"]) => void;
}

/** Tiny status surface for UI chips ("Transcribing in background…"). */
export const useTranscriptStatusStore = create<TranscriptStatusStore>(
	(set) => ({
		status: "idle",
		setStatus: (status) => set({ status }),
	}),
);

/**
 * Hash of everything that affects the timeline's WORDS: which media plays
 * when, with what trims. Volume/effects/text don't change the transcript.
 */
export function computeTimelineAudioHash(editor: EditorCore): string {
	const tracks = editor.scenes.getActiveScene().tracks;
	const parts: string[] = [];
	for (const track of [tracks.main, ...tracks.overlay, ...tracks.audio]) {
		for (const el of track.elements) {
			const obj = el as {
				type: string;
				mediaId?: string;
				startTime: number;
				duration: number;
				trimStart?: number;
				trimEnd?: number;
				isSourceAudioEnabled?: boolean;
			};
			if (obj.type !== "video" && obj.type !== "audio") continue;
			if (obj.type === "video" && obj.isSourceAudioEnabled === false) continue;
			parts.push(
				[
					obj.mediaId ?? "",
					Math.round(obj.startTime),
					Math.round(obj.duration),
					Math.round(obj.trimStart ?? 0),
					Math.round(obj.trimEnd ?? 0),
				].join(":"),
			);
		}
	}
	parts.sort();
	// djb2 over the joined string — collision-safe enough for a local cache.
	let hash = 5381;
	const joined = parts.join("|");
	for (let i = 0; i < joined.length; i++) {
		hash = ((hash << 5) + hash + joined.charCodeAt(i)) | 0;
	}
	return `${parts.length}-${(hash >>> 0).toString(36)}`;
}

function readCache(): Record<string, CacheEntry> {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return {};
		return JSON.parse(raw) as Record<string, CacheEntry>;
	} catch {
		return {};
	}
}

function writeCache(projectId: string, entry: CacheEntry): void {
	try {
		const cache = readCache();
		cache[projectId] = entry;
		const keys = Object.keys(cache);
		if (keys.length > MAX_PROJECT_ENTRIES) {
			keys
				.sort((a, b) => cache[a].createdAt - cache[b].createdAt)
				.slice(0, keys.length - MAX_PROJECT_ENTRIES)
				.forEach((key) => delete cache[key]);
		}
		localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
	} catch {
		// Cache is an optimization — quota errors must never break a run.
	}
}

export function getCachedTranscript(
	editor: EditorCore,
): TranscriptSegmentLite[] | null {
	const projectId = editor.project.getActive().metadata.id;
	const entry = readCache()[projectId];
	if (!entry) return null;
	return entry.hash === computeTimelineAudioHash(editor)
		? entry.segments
		: null;
}

let inFlight: Promise<TranscriptSegmentLite[]> | null = null;
let inFlightHash: string | null = null;

/**
 * The single transcription pipeline. Cache hit → instant. Otherwise extract
 * → decode → transcribe with honest staged progress (including a live
 * elapsed-seconds ticker while the model initializes — the stage that used
 * to look frozen at "20%"). Concurrent callers for the same timeline state
 * share one run.
 */
export async function ensureTimelineTranscript({
	editor,
	onProgress,
	signal,
}: {
	editor: EditorCore;
	onProgress?: (p: TranscribeProgress) => void;
	signal?: AbortSignal;
}): Promise<{ segments: TranscriptSegmentLite[]; fromCache: boolean }> {
	const cached = getCachedTranscript(editor);
	if (cached?.length) {
		return { segments: cached, fromCache: true };
	}

	const hash = computeTimelineAudioHash(editor);
	const projectId = editor.project.getActive().metadata.id;

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

	if (inFlight && inFlightHash === hash) {
		const segments = await abortable(inFlight);
		return { segments, fromCache: false };
	}

	const run = async (): Promise<TranscriptSegmentLite[]> => {
		const totalDuration = editor.timeline.getTotalDuration();
		if (totalDuration / TICKS_PER_SECOND < 1) {
			throw new Error("Add some footage to the timeline first.");
		}
		onProgress?.({
			phase: "extracting",
			detail: "Extracting timeline audio...",
		});
		const audioBlob = await extractTimelineAudio({
			tracks: editor.scenes.getActiveScene().tracks,
			mediaAssets: editor.media.getAssets(),
			totalDuration,
		});
		const { samples } = await decodeAudioToFloat32({
			audioBlob,
			sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
		});

		// Live elapsed ticker so model init never LOOKS frozen.
		let initTicker: ReturnType<typeof setInterval> | null = null;
		let initStartedAt = 0;
		const stopTicker = () => {
			if (initTicker) {
				clearInterval(initTicker);
				initTicker = null;
			}
		};
		try {
			const transcript = await transcriptionService.transcribe({
				audioData: samples,
				onProgress: (p) => {
					if (p.status === "loading-model") {
						if (p.progress >= 100) {
							if (!initTicker) {
								initStartedAt = Date.now();
								initTicker = setInterval(() => {
									const sec = Math.round((Date.now() - initStartedAt) / 1000);
									onProgress?.({
										phase: "initializing-model",
										detail: `Initializing speech model — ${sec}s elapsed (first run can take about a minute; later runs are instant)...`,
										progress: 1,
									});
								}, 1000);
								onProgress?.({
									phase: "initializing-model",
									detail:
										"Speech model downloaded — initializing (first run can take about a minute)...",
									progress: 1,
								});
							}
						} else {
							onProgress?.({
								phase: "downloading-model",
								detail: `Downloading speech model (one-time, ~40 MB): ${Math.round(p.progress)}%`,
								progress: p.progress / 100,
							});
						}
					} else if (p.status === "transcribing") {
						stopTicker();
						onProgress?.({
							phase: "transcribing",
							detail: "Listening to your video...",
						});
					}
				},
			});
			const segments: TranscriptSegmentLite[] = transcript.segments.map(
				(s) => ({ start: s.start, end: s.end, text: s.text }),
			);
			writeCache(projectId, { hash, segments, createdAt: Date.now() });
			return segments;
		} finally {
			stopTicker();
		}
	};

	inFlight = run().finally(() => {
		inFlight = null;
		inFlightHash = null;
	});
	inFlightHash = hash;
	const segments = await abortable(inFlight);
	return { segments, fromCache: false };
}
