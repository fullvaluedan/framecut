"use client";

/**
 * Shapes panel (replaces Stickers): the built-in vector shapes. Click a
 * tile to drop the shape at the playhead, drag it onto the timeline, or
 * use "place by clicking" to arm the shape tool and click the preview
 * where the shape should land.
 */

import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { usePlaceToolStore } from "@/preview/place-tool-store";
import { buildGraphicElement } from "@/timeline/element-utils";
import { cn } from "@/utils/ui";
import type { MediaTime } from "@/wasm";

const SHAPES: { definitionId: string; name: string; preview: React.ReactNode }[] = [
	{
		definitionId: "rectangle",
		name: "Rectangle",
		preview: <rect x="8" y="14" width="32" height="20" rx="2" />,
	},
	{
		definitionId: "ellipse",
		name: "Ellipse",
		preview: <ellipse cx="24" cy="24" rx="16" ry="11" />,
	},
	{
		definitionId: "polygon",
		name: "Polygon",
		preview: <polygon points="24,8 39,19 33,37 15,37 9,19" />,
	},
	{
		definitionId: "star",
		name: "Star",
		preview: (
			<polygon points="24,7 28,18 40,18 30,26 34,38 24,30 14,38 18,26 8,18 20,18" />
		),
	},
];

export function ShapesView() {
	const editor = useEditor();
	const tool = usePlaceToolStore((s) => s.tool);
	const setTool = usePlaceToolStore((s) => s.setTool);

	const addAtPlayhead = ({
		definitionId,
		currentTime,
	}: {
		definitionId: string;
		currentTime: MediaTime;
	}) => {
		const element = buildGraphicElement({
			definitionId,
			startTime: currentTime,
		});
		editor.timeline.insertElement({ element, placement: { mode: "auto" } });
	};

	return (
		<PanelView title="Shapes">
			<div className="grid grid-cols-2 gap-2">
				{SHAPES.map((shape) => {
					const isArmed =
						tool?.kind === "shape" && tool.definitionId === shape.definitionId;
					return (
						<div key={shape.definitionId} className="flex flex-col gap-1">
							<DraggableItem
								name={shape.name}
								preview={
									<div className="bg-accent flex size-full items-center justify-center rounded">
										<svg
											viewBox="0 0 48 48"
											className="size-10 fill-foreground/80"
										>
											{shape.preview}
										</svg>
									</div>
								}
								dragData={{
									id: `shape-${shape.definitionId}`,
									type: "graphic",
									name: shape.name,
									definitionId: shape.definitionId,
									params: {},
								}}
								aspectRatio={1}
								onAddToTimeline={({ currentTime }) =>
									addAtPlayhead({
										definitionId: shape.definitionId,
										currentTime,
									})
								}
								shouldShowLabel
							/>
							<Button
								variant={isArmed ? "secondary" : "ghost"}
								size="sm"
								className={cn("h-6 text-[0.65rem]", isArmed && "font-semibold")}
								onClick={() =>
									setTool(
										isArmed
											? null
											: { kind: "shape", definitionId: shape.definitionId },
									)
								}
							>
								{isArmed ? "Click the preview..." : "Place by clicking"}
							</Button>
						</div>
					);
				})}
			</div>
			<p className="text-muted-foreground mt-3 text-[0.65rem]">
				Click a shape to add it at the playhead, drag it onto the timeline,
				or arm &quot;Place by clicking&quot; and click the preview where it
				should go. Edit fill, stroke, and corners in the properties panel.
			</p>
		</PanelView>
	);
}
