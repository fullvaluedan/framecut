"use client";

import { toast } from "sonner";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { UpdateElementsCommand } from "@/commands/timeline/element/update-elements";
import { computeAvSyncOffset } from "@/timeline/av-sync";
import { frameRateToFloat } from "@/fps/utils";
import type { AudioElement, VideoElement } from "@/timeline";
import type { MediaTime } from "@/wasm";

/**
 * A/V sync readout + Realign for a video (or its separated audio). Shows the
 * frame/ms drift between the clip and its partner and snaps the audio back so
 * their source origins line up.
 */
export function AudioSyncSection({
	element,
}: {
	element: VideoElement | AudioElement;
}) {
	const editor = useEditor();
	const tracks = useEditor((e) => e.scenes.getActiveSceneOrNull()?.tracks);
	const fps = useEditor((e) => e.project.getActiveOrNull()?.settings.fps ?? null);
	if (!tracks) return null;

	const sync = computeAvSyncOffset({ element, tracks, fps });
	if (!sync || sync.offsetFrames === 0) return null;

	const ms = fps
		? Math.round((Math.abs(sync.offsetFrames) / frameRateToFloat(fps)) * 1000)
		: 0;

	const realign = () => {
		const allTracks = [
			...tracks.overlay,
			tracks.main,
			...tracks.audio,
		];
		const findById = (id: string) => {
			for (const track of allTracks) {
				const el = track.elements.find((e) => e.id === id);
				if (el) return { trackId: track.id, element: el };
			}
			return null;
		};
		const selfFound = findById(element.id);
		const partnerFound = findById(sync.partner.elementId);
		if (!selfFound || !partnerFound) return;
		const video =
			selfFound.element.type === "video" ? selfFound : partnerFound;
		const audio =
			selfFound.element.type === "audio" ? selfFound : partnerFound;
		if (audio.element.type !== "audio" || video.element.type !== "video") {
			return;
		}
		// audio.start − audio.trimStart must equal video.start − video.trimStart.
		const newStartTime = (video.element.startTime -
			video.element.trimStart +
			audio.element.trimStart) as MediaTime;
		editor.command.execute({
			command: new UpdateElementsCommand({
				updates: [
					{
						trackId: audio.trackId,
						elementId: audio.element.id,
						patch: { startTime: newStartTime },
					},
				],
			}),
		});
		toast.success("Audio realigned to the video");
	};

	const direction = sync.offsetFrames > 0 ? "behind" : "ahead of";

	return (
		<Section>
			<SectionHeader>
				<SectionTitle className="flex-1">A/V sync</SectionTitle>
			</SectionHeader>
			<SectionContent className="flex flex-col gap-2 px-3 pb-3">
				<p className="text-xs text-amber-500">
					Audio is {Math.abs(sync.offsetFrames)} frame
					{Math.abs(sync.offsetFrames) === 1 ? "" : "s"} ({ms} ms){" "}
					{direction} the video.
				</p>
				<Button
					variant="outline"
					size="sm"
					className="self-start text-xs"
					onClick={realign}
				>
					Realign
				</Button>
			</SectionContent>
		</Section>
	);
}
