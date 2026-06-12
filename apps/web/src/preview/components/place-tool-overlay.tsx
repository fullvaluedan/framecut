"use client";

/**
 * Click-capture layer for the Text/Shape place tools. Sits exactly over the
 * scene rect; a click converts to project-pixel coordinates (0,0 = canvas
 * center) and creates the element there at the playhead.
 */

import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { usePlaceToolStore } from "@/preview/place-tool-store";
import {
	buildGraphicElement,
	buildTextElement,
} from "@/timeline/element-utils";

export function PlaceToolOverlay({
	sceneLeft,
	sceneTop,
	sceneWidth,
	sceneHeight,
}: {
	sceneLeft: number;
	sceneTop: number;
	sceneWidth: number;
	sceneHeight: number;
}) {
	const editor = useEditor();
	const tool = usePlaceToolStore((s) => s.tool);
	const setTool = usePlaceToolStore((s) => s.setTool);
	if (!tool) return null;

	const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
		event.stopPropagation();
		const rect = event.currentTarget.getBoundingClientRect();
		const { width, height } = editor.project.getActive().settings.canvasSize;
		const positionX = Math.round(
			((event.clientX - rect.left) / rect.width - 0.5) * width,
		);
		const positionY = Math.round(
			((event.clientY - rect.top) / rect.height - 0.5) * height,
		);
		const startTime = editor.playback.getCurrentTime();
		const positionParams = {
			"transform.positionX": positionX,
			"transform.positionY": positionY,
		};

		const element =
			tool.kind === "text"
				? buildTextElement({
						raw: { params: positionParams },
						startTime,
					})
				: buildGraphicElement({
						definitionId: tool.definitionId,
						startTime,
						params: positionParams,
					});
		editor.timeline.insertElement({ element, placement: { mode: "auto" } });
		setTool(null);
		toast.success(
			tool.kind === "text" ? "Text added — start typing in the panel" : "Shape added",
		);
	};

	return (
		// eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- transient click-to-place surface; Escape/toggle exits the tool.
		<div
			className="absolute z-30 cursor-crosshair"
			title={
				tool.kind === "text"
					? "Click to place text (Esc to cancel)"
					: "Click to place the shape (Esc to cancel)"
			}
			style={{
				left: sceneLeft,
				top: sceneTop,
				width: sceneWidth,
				height: sceneHeight,
			}}
			onClick={handleClick}
		/>
	);
}
