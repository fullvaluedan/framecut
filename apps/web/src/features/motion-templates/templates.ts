/**
 * Native motion templates: the five HyperFrames planner templates rebuilt as
 * ordinary text/graphic elements with pre-baked keyframes. They insert
 * instantly, play in the native preview AND export (no Chrome render, no
 * ffmpeg burn-in), and stay fully editable afterwards.
 *
 * Variable ids intentionally MATCH packages/hf-bridge templates so the AI
 * planner's items drive either engine unchanged:
 *   callout-pill {text, accent, corner} Â· kinetic-title {text, accent}
 *   lower-third {title, subtitle, accent, align} Â· number-pop {value, label, accent}
 *   section-break {text, kicker, accent}
 */

import type { ElementAnimations } from "@/animation/types";
import type {
	CreateTimelineElement,
	SceneTracks,
	TextElement,
} from "@/timeline";
import { buildTextElement } from "@/timeline/element-utils";
import { generateUUID } from "@/utils/id";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME, type MediaTime } from "@/wasm";
import {
	bakeAnimations,
	fadeSlide,
	popIn,
	type TemplateChannels,
} from "./keyframes";

export type TemplateVariables = Record<string, string | number | boolean>;

export interface MotionTemplateArgs {
	startTime: MediaTime;
	durationSec: number;
	variables: TemplateVariables;
	accent: string;
	canvasSize: { width: number; height: number };
	/** Shared across the elements one apply produces. */
	groupId?: string;
	/** Prefix names with "AI: " when placed by the planner. */
	fromAi?: boolean;
}

/** One editable field surfaced in the Template Controls panel. */
export interface TemplateField {
	key: string;
	label: string;
	type: "text" | "color" | "enum";
	options?: { value: string; label: string }[];
	/** Seed shown when the element has no value yet (color fields fall back
	 *  to the active style accent when omitted). */
	default?: string;
}

export interface MotionTemplate {
	id: string;
	name: string;
	description: string;
	defaultDurationSec: number;
	durationRange: { min: number; max: number };
	/** Editable variables shown in the Template Controls panel. */
	fields: TemplateField[];
	build: (args: MotionTemplateArgs) => CreateTimelineElement[];
}

const DARK_PILL = "#0b0d12";

const CORNER_OPTIONS = [
	{ value: "top-left", label: "Top left" },
	{ value: "top-right", label: "Top right" },
	{ value: "bottom-left", label: "Bottom left" },
	{ value: "bottom-right", label: "Bottom right" },
];
const ALIGN_OPTIONS = [
	{ value: "left", label: "Left" },
	{ value: "right", label: "Right" },
];

function str(variables: TemplateVariables, key: string, fallback: string): string {
	const value = variables[key];
	return typeof value === "string" && value.trim() ? value : fallback;
}

function buildTemplateText({
	args,
	templateId,
	label,
	durationSec,
	params,
	channels,
	hidden,
}: {
	args: MotionTemplateArgs;
	templateId: string;
	label: string;
	durationSec: number;
	params: Record<string, string | number | boolean>;
	channels: TemplateChannels;
	/** Stable-count templates create some elements hidden until used. */
	hidden?: boolean;
}): CreateTimelineElement {
	const base = buildTextElement({
		raw: {
			name: `${args.fromAi ? "AI: " : ""}${label}`,
			duration: mediaTimeFromSeconds({ seconds: durationSec }),
			...(hidden ? { hidden: true } : {}),
			params,
			motionTemplate: {
				templateId,
				groupId: args.groupId ?? generateUUID(),
				variables: args.variables,
			},
		},
		startTime: args.startTime,
	});
	const animations = bakeAnimations({ element: base, channels });
	return animations ? { ...base, animations } : base;
}

/**
 * Re-bakes a template element's animations for a NEW duration (entrances
 * pinned to the start, exits pinned to the new end). Rebuilds the spec and
 * returns the matching element's freshly baked animations.
 */
export function rebakeTemplateAnimations({
	templateId,
	durationSec,
	variables,
	accent,
	canvasSize,
	elementIndex,
}: {
	templateId: string;
	durationSec: number;
	variables: TemplateVariables;
	accent: string;
	canvasSize: { width: number; height: number };
	elementIndex: number;
}): ElementAnimations | undefined {
	const template = getMotionTemplate(templateId);
	if (!template) return undefined;
	const specs = template.build({
		startTime: ZERO_MEDIA_TIME,
		durationSec,
		variables,
		accent,
		canvasSize,
	});
	const spec = specs[Math.min(elementIndex, specs.length - 1)];
	return spec?.animations;
}

export const MOTION_TEMPLATES: MotionTemplate[] = [
	{
		id: "callout-pill",
		name: "Callout pill",
		description: "Short phrase in a corner pill",
		defaultDurationSec: 3,
		durationRange: { min: 1, max: 10 },
		fields: [
			{ key: "text", label: "Text", type: "text", default: "Callout" },
			{
				key: "corner",
				label: "Corner",
				type: "enum",
				options: CORNER_OPTIONS,
				default: "top-right",
			},
			{ key: "accent", label: "Text color", type: "color" },
		],
		build: (args) => {
			const { width, height } = args.canvasSize;
			const corner = String(args.variables.corner ?? "top-right");
			const x = corner.includes("left") ? -(width / 2 - 320) : width / 2 - 320;
			const y = corner.includes("bottom") ? height / 2 - 130 : -(height / 2 - 130);
			const channels = fadeSlide({
				durationSec: args.durationSec,
				baseX: x,
				baseY: y,
				fromDy: corner.includes("bottom") ? 40 : -40,
			});
			const element = buildTemplateText({
				args,
				templateId: "callout-pill",
				label: "Callout pill",
				durationSec: args.durationSec,
				params: {
					content: str(args.variables, "text", "Callout"),
					fontSize: 34,
					fontWeight: "bold",
					color: str(args.variables, "accent", args.accent),
					textAlign: "center",
					"transform.positionX": x,
					"transform.positionY": y,
					"background.enabled": true,
					"background.color": DARK_PILL,
					"background.cornerRadius": 50,
					"background.paddingX": 28,
					"background.paddingY": 14,
				},
				channels,
			});
			return [element];
		},
	},
	{
		id: "kinetic-title",
		name: "Kinetic title",
		description: "Big pop-in title",
		defaultDurationSec: 3.5,
		durationRange: { min: 1, max: 10 },
		fields: [
			{ key: "text", label: "Title", type: "text", default: "TITLE" },
			{ key: "color", label: "Text color", type: "color", default: "#ffffff" },
		],
		build: (args) => {
			const channels = popIn({ durationSec: args.durationSec });
			const element = buildTemplateText({
				args,
				templateId: "kinetic-title",
				label: "Kinetic title",
				durationSec: args.durationSec,
				params: {
					content: str(args.variables, "text", "TITLE").toUpperCase(),
					fontSize: 110,
					fontWeight: "bold",
					color: str(args.variables, "color", "#ffffff"),
					textAlign: "center",
					letterSpacing: 2,
				},
				channels,
			});
			return [element];
		},
	},
	{
		id: "lower-third",
		name: "Lower third",
		description: "Name + subtitle bars",
		defaultDurationSec: 4,
		durationRange: { min: 1.5, max: 12 },
		fields: [
			{ key: "title", label: "Name", type: "text", default: "Name" },
			{ key: "subtitle", label: "Subtitle", type: "text", default: "Subtitle" },
			{
				key: "align",
				label: "Side",
				type: "enum",
				options: ALIGN_OPTIONS,
				default: "left",
			},
			{ key: "accent", label: "Bar color", type: "color" },
		],
		build: (args) => {
			const { width, height } = args.canvasSize;
			const align = String(args.variables.align ?? "left");
			const sign = align === "right" ? 1 : -1;
			const x = sign * (width / 2 - 380);
			const titleY = height / 2 - 190;
			const subY = height / 2 - 120;
			const slide = sign * -60;
			const groupId = args.groupId ?? generateUUID();
			const shared = { ...args, groupId };
			const titleChannels = fadeSlide({
				durationSec: args.durationSec,
				baseX: x,
				baseY: titleY,
				fromDx: slide,
			});
			const subChannels = fadeSlide({
				durationSec: args.durationSec,
				baseX: x,
				baseY: subY,
				fromDx: slide,
				delaySec: 0.12,
			});
			const title = buildTemplateText({
				args: shared,
				templateId: "lower-third",
				label: "Lower third",
				durationSec: args.durationSec,
				params: {
					content: str(args.variables, "title", "Name"),
					fontSize: 44,
					fontWeight: "bold",
					color: "#0b0d12",
					textAlign: align === "right" ? "right" : "left",
					"transform.positionX": x,
					"transform.positionY": titleY,
					"background.enabled": true,
					"background.color": str(args.variables, "accent", args.accent),
					"background.cornerRadius": 8,
					"background.paddingX": 22,
					"background.paddingY": 10,
				},
				channels: titleChannels,
			});
			const subtitle = buildTemplateText({
				args: shared,
				templateId: "lower-third",
				label: "Lower third subtitle",
				durationSec: args.durationSec,
				params: {
					content: str(args.variables, "subtitle", "Subtitle"),
					fontSize: 28,
					color: "#ffffff",
					textAlign: align === "right" ? "right" : "left",
					"transform.positionX": x,
					"transform.positionY": subY,
					"background.enabled": true,
					"background.color": DARK_PILL,
					"background.cornerRadius": 8,
					"background.paddingX": 18,
					"background.paddingY": 8,
				},
				channels: subChannels,
			});
			return [title, subtitle];
		},
	},
	{
		id: "number-pop",
		name: "Number pop",
		description: "Huge stat + label",
		defaultDurationSec: 3,
		durationRange: { min: 1, max: 10 },
		fields: [
			{ key: "value", label: "Number", type: "text", default: "100%" },
			{ key: "label", label: "Label", type: "text", default: "Label" },
			{ key: "accent", label: "Number color", type: "color" },
		],
		build: (args) => {
			const groupId = args.groupId ?? generateUUID();
			const shared = { ...args, groupId };
			const valueChannels = popIn({ durationSec: args.durationSec });
			const labelChannels = fadeSlide({
				durationSec: args.durationSec,
				baseX: 0,
				baseY: 110,
				fromDy: 30,
				delaySec: 0.15,
			});
			const value = buildTemplateText({
				args: shared,
				templateId: "number-pop",
				label: "Number pop",
				durationSec: args.durationSec,
				params: {
					content: str(args.variables, "value", "100%"),
					fontSize: 130,
					fontWeight: "bold",
					color: str(args.variables, "accent", args.accent),
					textAlign: "center",
					"transform.positionY": -30,
				},
				channels: valueChannels,
			});
			const label = buildTemplateText({
				args: shared,
				templateId: "number-pop",
				label: "Number pop label",
				durationSec: args.durationSec,
				params: {
					content: str(args.variables, "label", "Label"),
					fontSize: 30,
					color: "#ffffff",
					textAlign: "center",
					"transform.positionY": 110,
				},
				channels: labelChannels,
			});
			return [value, label];
		},
	},
	{
		id: "section-break",
		name: "Section break",
		description: "Accent bar chapter card",
		defaultDurationSec: 2.5,
		durationRange: { min: 1, max: 8 },
		fields: [
			{ key: "text", label: "Heading", type: "text", default: "Next chapter" },
			{
				key: "kicker",
				label: "Kicker (small label)",
				type: "text",
				default: "",
			},
			{ key: "accent", label: "Bar color", type: "color" },
		],
		build: (args) => {
			const groupId = args.groupId ?? generateUUID();
			const shared = { ...args, groupId };
			const out = Math.max(0.5, args.durationSec - 0.4);
			const end = Math.max(out + 0.05, args.durationSec - 0.05);
			// The pill background growing from zero paddingX reads as a native
			// grow-from-center wipe (background.paddingX is keyframable and
			// resolved in export).
			const mainChannels: TemplateChannels = {
				opacity: [
					{ atSec: 0, value: 0 },
					{ atSec: 0.15, value: 1 },
					{ atSec: out, value: 1 },
					{ atSec: end, value: 0 },
				],
				"background.paddingX": [
					{ atSec: 0, value: 0 },
					{ atSec: 0.45, value: 60 },
					{ atSec: out, value: 60 },
					{ atSec: end, value: 0 },
				],
			};
			const kicker = str(args.variables, "kicker", "");
			const main = buildTemplateText({
				args: shared,
				templateId: "section-break",
				label: "Section break",
				durationSec: args.durationSec,
				params: {
					content: str(args.variables, "text", "Next chapter"),
					fontSize: 64,
					fontWeight: "bold",
					color: "#0b0d12",
					textAlign: "center",
					"background.enabled": true,
					"background.color": str(args.variables, "accent", args.accent),
					"background.cornerRadius": 4,
					"background.paddingX": 60,
					"background.paddingY": 18,
				},
				channels: mainChannels,
			});
			// Always create the kicker element (hidden when empty) so the
			// element count is stable — the Template Controls editor maps
			// rebuilt elements onto existing siblings by index.
			const kickerChannels = fadeSlide({
				durationSec: args.durationSec,
				baseX: 0,
				baseY: -110,
				fromDy: -24,
				delaySec: 0.1,
			});
			const kickerElement = buildTemplateText({
				args: shared,
				templateId: "section-break",
				label: "Section break kicker",
				durationSec: args.durationSec,
				hidden: !kicker,
				params: {
					content: (kicker || "Kicker").toUpperCase(),
					fontSize: 26,
					color: "#ffffff",
					textAlign: "center",
					letterSpacing: 6,
					"transform.positionY": -110,
				},
				channels: kickerChannels,
			});
			return [main, kickerElement];
		},
	},
];

export function getMotionTemplate(id: string): MotionTemplate | undefined {
	return MOTION_TEMPLATES.find((t) => t.id === id);
}

/**
 * All text elements of one template instance (the elements a single build()
 * produced, sharing motionTemplate.groupId), in track order. The Template
 * Controls editor maps a rebuilt element[i] onto sibling[i].
 */
export function getMotionTemplateGroup({
	tracks,
	groupId,
}: {
	tracks: SceneTracks;
	groupId: string;
}): { trackId: string; element: TextElement }[] {
	const result: { trackId: string; element: TextElement }[] = [];
	for (const track of [...tracks.overlay, tracks.main, ...tracks.audio]) {
		for (const element of track.elements) {
			if (
				element.type === "text" &&
				element.motionTemplate?.groupId === groupId
			) {
				result.push({ trackId: track.id, element });
			}
		}
	}
	return result;
}
