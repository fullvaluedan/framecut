/**
 * Autocut: one click from a bin full of sources to a rough cut —
 * assembles everything onto the timeline, then removes the silences.
 */

import type { EditorCore } from "@/core";
import { assembleBinToTimeline } from "./assemble";
import { runRemoveSilences } from "./remove-silences";

export async function runAutocut({
	editor,
	onProgress,
}: {
	editor: EditorCore;
	onProgress?: (detail: string) => void;
}): Promise<{ assembled: number; cuts: number; removedSec: number }> {
	onProgress?.("Assembling sources...");
	const { added } = assembleBinToTimeline({
		editor,
		assets: editor.media.getAssets(),
	});

	onProgress?.("Removing silences...");
	const { cuts, removedSec } = await runRemoveSilences({ editor });
	return { assembled: added, cuts, removedSec };
}
