/**
 * UI state for the timeline
 * For core logic, use EditorCore instead.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TimelineStore {
	snappingEnabled: boolean;
	toggleSnapping: () => void;
	rippleEditingEnabled: boolean;
	toggleRippleEditing: () => void;
	videoWaveformsEnabled: boolean;
	toggleVideoWaveforms: () => void;
	linkedSelectionEnabled: boolean;
	toggleLinkedSelection: () => void;
	expandedElementIds: Set<string>;
	toggleElementExpanded: (elementId: string) => void;
}

export const useTimelineStore = create<TimelineStore>()(
	persist(
		(set) => ({
			snappingEnabled: true,

			toggleSnapping: () => {
				set((state) => ({ snappingEnabled: !state.snappingEnabled }));
			},

			rippleEditingEnabled: false,

			toggleRippleEditing: () => {
				set((state) => ({
					rippleEditingEnabled: !state.rippleEditingEnabled,
				}));
			},

			videoWaveformsEnabled: true,

			toggleVideoWaveforms: () => {
				set((state) => ({
					videoWaveformsEnabled: !state.videoWaveformsEnabled,
				}));
			},

			linkedSelectionEnabled: true,

			toggleLinkedSelection: () => {
				set((state) => ({
					linkedSelectionEnabled: !state.linkedSelectionEnabled,
				}));
			},

			expandedElementIds: new Set<string>(),

			toggleElementExpanded: (elementId) => {
				set((state) => {
					const next = new Set(state.expandedElementIds);
					if (next.has(elementId)) {
						next.delete(elementId);
					} else {
						next.add(elementId);
					}
					return { expandedElementIds: next };
				});
			},
		}),
		{
			name: "timeline-store",
			partialize: (state) => ({
				snappingEnabled: state.snappingEnabled,
				rippleEditingEnabled: state.rippleEditingEnabled,
				videoWaveformsEnabled: state.videoWaveformsEnabled,
				linkedSelectionEnabled: state.linkedSelectionEnabled,
			}),
			version: 1,
			migrate: (persisted) => {
				// linkedSelectionEnabled was added later — default it ON for
				// older persisted stores that predate the field.
				const p = persisted as Record<string, unknown> | null;
				if (p && p.linkedSelectionEnabled === undefined) {
					p.linkedSelectionEnabled = true;
				}
				return p as never;
			},
		},
	),
);
