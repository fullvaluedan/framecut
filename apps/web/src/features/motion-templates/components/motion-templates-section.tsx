"use client";

/**
 * Motion templates gallery (Text tab): native recreations of the HyperFrames
 * templates — instant insert, native preview AND export (no Chrome render,
 * no ffmpeg burn-in), fully editable afterwards. Plus the Swiss grid layout,
 * which restyles the whole frame around your scaled-down video.
 */

import { toast } from "sonner";
import { BatchCommand } from "@/commands";
import { InsertElementCommand } from "@/commands/timeline/element/insert-element";
import { UpdateElementsCommand } from "@/commands/timeline/element/update-elements";
import { useEditor } from "@/editor/use-editor";
import { useAiSettingsStore } from "@/features/ai-generate/store";
import { getStyleById } from "@/features/ai-generate/styles";
import {
	MOTION_TEMPLATES,
	getMotionTemplate,
} from "@/features/motion-templates/templates";
import {
	bakeAnimations,
	fadeSlide,
} from "@/features/motion-templates/keyframes";
import { DEFAULT_GRAPHIC_SOURCE_SIZE } from "@/graphics/types";
import {
	buildGraphicElement,
	buildTextElement,
} from "@/timeline/element-utils";
import { generateUUID } from "@/utils/id";
import { mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";

export function MotionTemplatesSection() {
	const editor = useEditor();
	const accent = useAiSettingsStore((s) => getStyleById(s.styleId).accent);

	const insertTemplate = (templateId: string) => {
		const template = getMotionTemplate(templateId);
		if (!template) return;
		const canvasSize = editor.project.getActive().settings.canvasSize;
		const elements = template.build({
			startTime: editor.playback.getCurrentTime(),
			durationSec: template.defaultDurationSec,
			variables: {},
			accent,
			canvasSize,
		});
		editor.command.execute({
			command: new BatchCommand(
				elements.map(
					(element) =>
						new InsertElementCommand({
							element,
							placement: { mode: "auto" },
						}),
				),
			),
		});
		toast.success(`${template.name} added at the playhead`, {
			description: "Edit the text and look in the properties panel.",
		});
	};

	const applySwissGrid = () => {
		const tracks = editor.scenes.getActiveScene().tracks;
		const canvasSize = editor.project.getActive().settings.canvasSize;
		const { width, height } = canvasSize;
		const now = editor.playback.getCurrentTime();
		const mainVideo = tracks.main.elements.find(
			(el) =>
				el.type === "video" &&
				now >= el.startTime &&
				now < el.startTime + el.duration,
		) ?? tracks.main.elements.find((el) => el.type === "video");
		const durationSec = 8;

		// The grid plate's transparent window (defaults from the definition):
		// x 42% w 52% / y 12% h 62% — scale the video into its center.
		const cellCenterX = (0.42 + 0.52 / 2 - 0.5) * width;
		const cellCenterY = (0.12 + 0.62 / 2 - 0.5) * height;
		const cellScale = 0.52 * 1.0;

		const commands = [];
		const grid = buildGraphicElement({
			definitionId: "swiss-grid",
			name: "Swiss grid plate",
			startTime: now,
			params: {
				accent,
				"transform.scaleX": width / DEFAULT_GRAPHIC_SOURCE_SIZE,
				"transform.scaleY": height / DEFAULT_GRAPHIC_SOURCE_SIZE,
			},
		});
		grid.duration = mediaTimeFromSeconds({ seconds: durationSec });
		commands.push(
			new InsertElementCommand({ element: grid, placement: { mode: "auto" } }),
		);

		const groupId = generateUUID();
		["Key point 1", "Key point 2", "Key point 3"].forEach((copy, index) => {
			const y = -height * 0.18 + index * height * 0.16;
			const x = -(width / 2 - width * 0.22);
			const element = buildTextElement({
				raw: {
					name: copy,
					duration: mediaTimeFromSeconds({ seconds: durationSec }),
					params: {
						content: copy,
						fontSize: 40,
						fontWeight: "bold",
						color: "#ffffff",
						textAlign: "left",
						"transform.positionX": x,
						"transform.positionY": y,
					},
					motionTemplate: {
						templateId: "swiss-grid-keypoint",
						groupId,
						variables: { text: copy },
					},
				},
				startTime: now,
			});
			const animations = bakeAnimations({
				element,
				channels: fadeSlide({
					durationSec,
					baseX: x,
					baseY: y,
					fromDx: -50,
					delaySec: 0.25 + index * 0.18,
				}),
			});
			commands.push(
				new InsertElementCommand({
					element: animations ? { ...element, animations } : element,
					placement: { mode: "auto" },
				}),
			);
		});

		if (mainVideo) {
			const mainTrackId = tracks.main.id;
			commands.push(
				new UpdateElementsCommand({
					updates: [
						{
							trackId: mainTrackId,
							elementId: mainVideo.id,
							patch: {
								params: {
									...mainVideo.params,
									"transform.scaleX": cellScale,
									"transform.scaleY": cellScale,
									"transform.positionX": cellCenterX,
									"transform.positionY": cellCenterY,
								},
							},
						},
					],
				}),
			);
		}

		editor.command.execute({ command: new BatchCommand(commands) });
		toast.success("Swiss grid applied", {
			description: mainVideo
				? "Your video is scaled into the grid window — adjust crop/scale/position in Effect Controls. Edit the key points like any text."
				: "No video on V1 to scale — drop footage on the main track, then move it into the window via Effect Controls.",
		});
	};

	return (
		<div className="flex flex-col gap-1.5 pt-3">
			<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
				Motion templates (instant)
			</p>
			<div className="grid grid-cols-2 gap-1.5">
				{MOTION_TEMPLATES.map((template) => (
					<button
						key={template.id}
						type="button"
						className="bg-foreground/5 hover:bg-foreground/10 hover:ring-primary/50 flex flex-col items-start gap-1 rounded-md p-2 text-left ring-1 ring-transparent transition-colors"
						title={`${template.description} — click to add at the playhead`}
						onClick={() => insertTemplate(template.id)}
					>
						<TemplatePreview templateId={template.id} accent={accent} />
						<span className="text-xs font-medium">{template.name}</span>
						<span className="text-muted-foreground text-[10px] leading-snug">
							{template.description}
						</span>
					</button>
				))}
				<button
					type="button"
					className="bg-foreground/5 hover:bg-foreground/10 hover:ring-primary/50 flex flex-col items-start gap-1 rounded-md p-2 text-left ring-1 ring-transparent transition-colors"
					title="Full-frame Swiss layout: grid plate + your video scaled into the window + editable key points"
					onClick={applySwissGrid}
				>
					<div className="relative h-12 w-full overflow-hidden rounded-sm bg-[#101114]">
						<div
							className="absolute top-1.5 left-1.5 h-0.5 w-5"
							style={{ backgroundColor: accent }}
						/>
						<div className="text-muted-foreground absolute top-3.5 left-1.5 flex flex-col gap-1">
							<div className="h-0.5 w-6 bg-white/70" />
							<div className="h-0.5 w-5 bg-white/40" />
							<div className="h-0.5 w-4 bg-white/40" />
						</div>
						<div
							className="absolute top-2 right-1.5 h-7 w-12 rounded-[2px] border bg-black/40"
							style={{ borderColor: accent }}
						/>
					</div>
					<span className="text-xs font-medium">Swiss grid layout</span>
					<span className="text-muted-foreground text-[10px] leading-snug">
						Grid plate + video in the window + key points
					</span>
				</button>
			</div>
		</div>
	);
}

function TemplatePreview({
	templateId,
	accent,
}: {
	templateId: string;
	accent: string;
}) {
	const base = "relative h-12 w-full overflow-hidden rounded-sm bg-black/60";
	switch (templateId) {
		case "callout-pill":
			return (
				<div className={base}>
					<span
						className="absolute top-1.5 right-1.5 rounded-full bg-[#0b0d12] px-2 py-0.5 text-[8px] font-bold"
						style={{ color: accent }}
					>
						Callout
					</span>
				</div>
			);
		case "kinetic-title":
			return (
				<div className={`${base} flex items-center justify-center`}>
					<span className="text-[13px] font-black tracking-wider text-white">
						TITLE
					</span>
				</div>
			);
		case "lower-third":
			return (
				<div className={base}>
					<span
						className="absolute bottom-3.5 left-1.5 rounded-[2px] px-1.5 text-[8px] font-bold text-black"
						style={{ backgroundColor: accent }}
					>
						Name
					</span>
					<span className="absolute bottom-1 left-1.5 rounded-[2px] bg-[#0b0d12] px-1.5 text-[7px] text-white">
						Subtitle
					</span>
				</div>
			);
		case "number-pop":
			return (
				<div className={`${base} flex flex-col items-center justify-center`}>
					<span className="text-[15px] font-black" style={{ color: accent }}>
						87%
					</span>
					<span className="text-[7px] text-white/80">label</span>
				</div>
			);
		case "section-break":
			return (
				<div className={`${base} flex items-center justify-center`}>
					<span
						className="rounded-[2px] px-3 py-0.5 text-[9px] font-bold text-black"
						style={{ backgroundColor: accent }}
					>
						Next chapter
					</span>
				</div>
			);
		default:
			return <div className={base} />;
	}
}
