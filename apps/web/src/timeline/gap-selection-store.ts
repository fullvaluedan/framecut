/**
 * Premiere-style gap selection: clicking the empty space between two clips
 * on a track selects the GAP itself (highlighted on that track). Delete then
 * ripple-deletes the gap across all tracks — blocked, like Premiere, when
 * clips on another track overlap the gap's span.
 */

import { create } from "zustand";

export interface SelectedGap {
	trackId: string;
	/** Gap bounds in ticks. */
	start: number;
	end: number;
}

interface GapSelectionStore {
	gap: SelectedGap | null;
	setGap: (gap: SelectedGap | null) => void;
}

export const useGapSelectionStore = create<GapSelectionStore>((set) => ({
	gap: null,
	setGap: (gap) => set({ gap }),
}));
