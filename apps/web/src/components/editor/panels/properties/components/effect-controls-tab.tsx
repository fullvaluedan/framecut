"use client";

/**
 * Premiere-style Effect Controls: replaces the flat Transform tab with
 * collapsible fx groups (Motion, Opacity). Rows have a keyframe stopwatch,
 * the property name, and blue scrubbable values — Position shows X/Y on one
 * row, Scale gets a Uniform Scale checkbox like Premiere's Motion effect.
 */

import { useState } from "react";
import {
	getKeyframeAtTime,
	hasKeyframesForPath,
	resolveAnimationPathValueAtTime,
	upsertPathKeyframe,
} from "@/animation";
import type { AnimationPath } from "@/animation/types";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { useKeyframedParamProperty } from "@/components/editor/panels/properties/hooks/use-keyframed-param-property";
import { KeyframeToggle } from "@/components/editor/panels/properties/components/keyframe-toggle";
import { NumberField } from "@/components/ui/number-field";
import { Checkbox } from "@/components/ui/checkbox";
import { useEditor } from "@/editor/use-editor";
import {
	coerceParamValue,
	getParamChannelLayout,
} from "@/params";
import {
	getElementParams,
	readElementParamValue,
	writeElementParamValue,
	type ElementParamDefinition,
} from "@/params/registry";
import type { TimelineElement, VisualElement } from "@/timeline";
import type { MediaTime } from "@/wasm";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

const POSITION_X = "transform.positionX";
const POSITION_Y = "transform.positionY";
const SCALE_X = "transform.scaleX";
const SCALE_Y = "transform.scaleY";
const ROTATE = "transform.rotate";
const OPACITY = "opacity";

/** Premiere shows values in blue; inputs stay borderless until interaction. */
const VALUE_FIELD_CLASS =
	"w-[72px] [&_input]:text-sky-400 [&_input]:font-medium";

interface RowContext {
	element: VisualElement;
	trackId: string;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
}

function findParam(
	element: TimelineElement,
	key: string,
): ElementParamDefinition | null {
	return getElementParams({ element }).find((p) => p.key === key) ?? null;
}

function formatDisplay(value: number, decimals: number): string {
	return value.toFixed(decimals);
}

/**
 * Text-draft wrapper around NumberField: shows resolved value scaled into
 * display units (e.g. scale 1.0 → 100.0) and converts typed/scrubbed input
 * back into model units.
 */
function ValueField({
	resolved,
	factor,
	decimals,
	suffix,
	iconLabel,
	isDefault,
	onPreviewModel,
	onCommit,
	onResetModel,
}: {
	resolved: number;
	factor: number;
	decimals: number;
	suffix?: string;
	iconLabel?: string;
	isDefault: boolean;
	onPreviewModel: (modelValue: number) => void;
	onCommit: () => void;
	onResetModel?: () => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const display = draft ?? formatDisplay(resolved * factor, decimals);

	return (
		<div className={VALUE_FIELD_CLASS}>
			<NumberField
				icon={iconLabel ?? ""}
				value={display}
				suffix={suffix}
				dragSensitivity="slow"
				isDefault={isDefault}
				onFocus={() => setDraft(formatDisplay(resolved * factor, decimals))}
				onChange={(e) => {
					const text = e.target.value;
					setDraft(text);
					const parsed = parseFloat(text);
					if (Number.isFinite(parsed)) onPreviewModel(parsed / factor);
				}}
				onBlur={() => {
					setDraft(null);
					onCommit();
				}}
				onScrub={(v) => onPreviewModel(v / factor)}
				onScrubEnd={onCommit}
				onReset={onResetModel}
			/>
		</div>
	);
}

function Row({
	label,
	keyframe,
	children,
	indent = true,
}: {
	label: string;
	keyframe?: { isActive: boolean; isDisabled: boolean; onToggle: () => void };
	children: React.ReactNode;
	indent?: boolean;
}) {
	return (
		<div className={cn("flex h-7 items-center gap-1 pr-2", indent && "pl-1")}>
			{keyframe ? (
				<KeyframeToggle
					isActive={keyframe.isActive}
					isDisabled={keyframe.isDisabled}
					title={`Toggle ${label.toLowerCase()} keyframe at the playhead`}
					onToggle={keyframe.onToggle}
				/>
			) : (
				<span className="w-6" />
			)}
			<span className="w-[84px] shrink-0 truncate text-xs text-foreground/75">
				{label}
			</span>
			<div className="flex min-w-0 flex-1 items-center justify-end gap-1">
				{children}
			</div>
		</div>
	);
}

function FxGroup({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(true);
	return (
		<div className="border-b py-1 last:border-b-0">
			<button
				type="button"
				className="flex w-full items-center gap-1.5 px-1 py-1 text-left"
				onClick={() => setOpen((o) => !o)}
			>
				<HugeiconsIcon
					icon={open ? ArrowDown01Icon : ArrowRight01Icon}
					size={14}
					className="text-muted-foreground"
				/>
				<span className="text-[10px] font-bold italic text-primary/80">fx</span>
				<span className="text-xs font-semibold">{title}</span>
			</button>
			{open && <div className="flex flex-col">{children}</div>}
		</div>
	);
}

/** One keyframable scalar property (Rotation, Opacity). */
function SingleRow({
	ctx,
	paramKey,
	label,
	factor,
	decimals,
	suffix,
	iconLabel,
}: {
	ctx: RowContext;
	paramKey: string;
	label: string;
	factor: number;
	decimals: number;
	suffix?: string;
	iconLabel?: string;
}) {
	const { element, trackId, localTime, isPlayheadWithinElementRange } = ctx;
	const param = findParam(element, paramKey);
	const fallbackParam: ElementParamDefinition =
		param ??
		({ key: paramKey, label, type: "number", default: 0 } as ElementParamDefinition);
	const baseValue =
		(param ? readElementParamValue({ element, param }) : null) ??
		fallbackParam.default;
	const resolved = resolveAnimationPathValueAtTime({
		animations: element.animations,
		propertyPath: paramKey,
		localTime,
		fallbackValue: baseValue,
	});
	const animated = useKeyframedParamProperty({
		param: fallbackParam,
		trackId,
		elementId: element.id,
		animations: element.animations,
		propertyPath: paramKey as AnimationPath,
		localTime,
		isPlayheadWithinElementRange,
		resolvedValue: resolved,
		buildBaseUpdates: ({ value }) =>
			writeElementParamValue({ element, param: fallbackParam, value }),
	});
	if (!param) return null;
	const resolvedNumber = typeof resolved === "number" ? resolved : 0;
	const defaultNumber =
		typeof param.default === "number" ? param.default : 0;

	return (
		<Row
			label={label}
			keyframe={{
				isActive: animated.isKeyframedAtTime,
				isDisabled: !isPlayheadWithinElementRange,
				onToggle: animated.toggleKeyframe,
			}}
		>
			<ValueField
				resolved={resolvedNumber}
				factor={factor}
				decimals={decimals}
				suffix={suffix}
				iconLabel={iconLabel}
				isDefault={resolvedNumber === defaultNumber}
				onPreviewModel={(v) => animated.onPreview(v)}
				onCommit={animated.onCommit}
				onResetModel={() => {
					animated.onPreview(defaultNumber);
					animated.onCommit();
				}}
			/>
		</Row>
	);
}

/** Position: X and Y side by side, one stopwatch for both channels. */
function PositionRow({ ctx }: { ctx: RowContext }) {
	const { element, trackId, localTime, isPlayheadWithinElementRange } = ctx;
	const editor = useEditor();
	const paramX = findParam(element, POSITION_X);
	const paramY = findParam(element, POSITION_Y);

	const resolve = (key: string, param: ElementParamDefinition | null) => {
		const base =
			(param ? readElementParamValue({ element, param }) : null) ??
			param?.default ??
			0;
		const value = resolveAnimationPathValueAtTime({
			animations: element.animations,
			propertyPath: key,
			localTime,
			fallbackValue: base,
		});
		return typeof value === "number" ? value : 0;
	};
	const x = resolve(POSITION_X, paramX);
	const y = resolve(POSITION_Y, paramY);

	const previewAxis = (
		param: ElementParamDefinition,
		key: AnimationPath,
		value: number,
	) => {
		const animatedChannel =
			hasKeyframesForPath({
				animations: element.animations,
				propertyPath: key,
			}) && isPlayheadWithinElementRange;
		if (animatedChannel) {
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: {
							animations: upsertPathKeyframe({
								animations: element.animations,
								propertyPath: key,
								time: localTime,
								value,
								channelLayout: getParamChannelLayout({ param }),
								coerceValue: ({ value: next }) =>
									coerceParamValue({ param, value: next }),
							}),
						},
					},
				],
			});
			return;
		}
		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: writeElementParamValue({ element, param, value }),
				},
			],
		});
	};

	const commit = () => editor.timeline.commitPreview();

	const kfX = getKeyframeAtTime({
		animations: element.animations,
		propertyPath: POSITION_X,
		time: localTime,
	});
	const kfY = getKeyframeAtTime({
		animations: element.animations,
		propertyPath: POSITION_Y,
		time: localTime,
	});
	const togglePair = () => {
		if (!isPlayheadWithinElementRange) return;
		if (kfX || kfY) {
			const removals = [];
			if (kfX)
				removals.push({
					trackId,
					elementId: element.id,
					propertyPath: POSITION_X as AnimationPath,
					keyframeId: kfX.id,
				});
			if (kfY)
				removals.push({
					trackId,
					elementId: element.id,
					propertyPath: POSITION_Y as AnimationPath,
					keyframeId: kfY.id,
				});
			editor.timeline.removeKeyframes({ keyframes: removals });
			return;
		}
		editor.timeline.upsertKeyframes({
			keyframes: [
				{
					trackId,
					elementId: element.id,
					propertyPath: POSITION_X as AnimationPath,
					time: localTime,
					value: x,
				},
				{
					trackId,
					elementId: element.id,
					propertyPath: POSITION_Y as AnimationPath,
					time: localTime,
					value: y,
				},
			],
		});
	};

	if (!paramX || !paramY) return null;

	return (
		<Row
			label="Position"
			keyframe={{
				isActive: Boolean(kfX || kfY),
				isDisabled: !isPlayheadWithinElementRange,
				onToggle: togglePair,
			}}
		>
			<ValueField
				resolved={x}
				factor={1}
				decimals={1}
				iconLabel="X"
				isDefault={x === paramX.default}
				onPreviewModel={(v) => previewAxis(paramX, POSITION_X, v)}
				onCommit={commit}
				onResetModel={() => {
					previewAxis(paramX, POSITION_X, Number(paramX.default) || 0);
					commit();
				}}
			/>
			<ValueField
				resolved={y}
				factor={1}
				decimals={1}
				iconLabel="Y"
				isDefault={y === paramY.default}
				onPreviewModel={(v) => previewAxis(paramY, POSITION_Y, v)}
				onCommit={commit}
				onResetModel={() => {
					previewAxis(paramY, POSITION_Y, Number(paramY.default) || 0);
					commit();
				}}
			/>
		</Row>
	);
}

/**
 * Scale with Premiere's Uniform Scale behavior: checked → one "Scale" value
 * drives both axes; unchecked → separate Scale Height / Scale Width rows.
 */
function ScaleRows({ ctx }: { ctx: RowContext }) {
	const { element, trackId, localTime, isPlayheadWithinElementRange } = ctx;
	const editor = useEditor();
	const paramX = findParam(element, SCALE_X);
	const paramY = findParam(element, SCALE_Y);

	const resolve = (key: string, param: ElementParamDefinition | null) => {
		const base =
			(param ? readElementParamValue({ element, param }) : null) ??
			param?.default ??
			1;
		const value = resolveAnimationPathValueAtTime({
			animations: element.animations,
			propertyPath: key,
			localTime,
			fallbackValue: base,
		});
		return typeof value === "number" ? value : 1;
	};
	const sx = resolve(SCALE_X, paramX);
	const sy = resolve(SCALE_Y, paramY);
	const [uniform, setUniform] = useState(sx === sy);

	const previewAxis = (
		param: ElementParamDefinition,
		key: AnimationPath,
		value: number,
		baseElement: TimelineElement,
	): { animations?: TimelineElement["animations"]; element: TimelineElement } => {
		const animatedChannel =
			hasKeyframesForPath({
				animations: element.animations,
				propertyPath: key,
			}) && isPlayheadWithinElementRange;
		if (animatedChannel) {
			return {
				element: baseElement,
				animations: upsertPathKeyframe({
					animations: baseElement.animations,
					propertyPath: key,
					time: localTime,
					value,
					channelLayout: getParamChannelLayout({ param }),
					coerceValue: ({ value: next }) =>
						coerceParamValue({ param, value: next }),
				}),
			};
		}
		return {
			element: writeElementParamValue({ element: baseElement, param, value }),
		};
	};

	const previewScale = (value: number, axes: "both" | "x" | "y") => {
		if (!paramX || !paramY) return;
		let working: TimelineElement = element;
		if (axes === "both" || axes === "x") {
			const out = previewAxis(paramX, SCALE_X, value, working);
			working = out.animations
				? { ...out.element, animations: out.animations }
				: out.element;
		}
		if (axes === "both" || axes === "y") {
			const out = previewAxis(paramY, SCALE_Y, value, working);
			working = out.animations
				? { ...out.element, animations: out.animations }
				: out.element;
		}
		editor.timeline.previewElements({
			updates: [{ trackId, elementId: element.id, updates: working }],
		});
	};
	const commit = () => editor.timeline.commitPreview();

	const kfX = getKeyframeAtTime({
		animations: element.animations,
		propertyPath: SCALE_X,
		time: localTime,
	});
	const kfY = getKeyframeAtTime({
		animations: element.animations,
		propertyPath: SCALE_Y,
		time: localTime,
	});
	const togglePair = () => {
		if (!isPlayheadWithinElementRange) return;
		if (kfX || kfY) {
			const removals = [];
			if (kfX)
				removals.push({
					trackId,
					elementId: element.id,
					propertyPath: SCALE_X as AnimationPath,
					keyframeId: kfX.id,
				});
			if (kfY)
				removals.push({
					trackId,
					elementId: element.id,
					propertyPath: SCALE_Y as AnimationPath,
					keyframeId: kfY.id,
				});
			editor.timeline.removeKeyframes({ keyframes: removals });
			return;
		}
		editor.timeline.upsertKeyframes({
			keyframes: [
				{
					trackId,
					elementId: element.id,
					propertyPath: SCALE_X as AnimationPath,
					time: localTime,
					value: sx,
				},
				{
					trackId,
					elementId: element.id,
					propertyPath: SCALE_Y as AnimationPath,
					time: localTime,
					value: sy,
				},
			],
		});
	};

	if (!paramX || !paramY) return null;
	const defaultScale = Number(paramX.default) || 1;
	const keyframeState = {
		isActive: Boolean(kfX || kfY),
		isDisabled: !isPlayheadWithinElementRange,
		onToggle: togglePair,
	};

	return (
		<>
			<Row label={uniform ? "Scale" : "Scale Height"} keyframe={keyframeState}>
				<ValueField
					resolved={sy}
					factor={100}
					decimals={1}
					iconLabel="S"
					isDefault={uniform ? sx === defaultScale && sy === defaultScale : sy === defaultScale}
					onPreviewModel={(v) => previewScale(v, uniform ? "both" : "y")}
					onCommit={commit}
					onResetModel={() => {
						previewScale(defaultScale, uniform ? "both" : "y");
						commit();
					}}
				/>
			</Row>
			<Row label="Scale Width" keyframe={undefined}>
				<div className={cn(uniform && "pointer-events-none opacity-40")}>
					<ValueField
						resolved={sx}
						factor={100}
						decimals={1}
						iconLabel="W"
						isDefault={sx === defaultScale}
						onPreviewModel={(v) => previewScale(v, "x")}
						onCommit={commit}
						onResetModel={() => {
							previewScale(defaultScale, "x");
							commit();
						}}
					/>
				</div>
			</Row>
			<Row label="" keyframe={undefined}>
				<label className="flex cursor-pointer items-center gap-2 text-xs text-foreground/75">
					<Checkbox
						checked={uniform}
						onCheckedChange={(checked) => {
							const next = checked === true;
							setUniform(next);
							if (next && sx !== sy) {
								previewScale(sy, "both");
								commit();
							}
						}}
					/>
					Uniform Scale
				</label>
			</Row>
		</>
	);
}

export function EffectControlsTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const ctx: RowContext = {
		element,
		trackId,
		localTime,
		isPlayheadWithinElementRange,
	};

	return (
		<div className="flex flex-col px-2 pt-2">
			<FxGroup title="Motion">
				<PositionRow ctx={ctx} />
				<ScaleRows ctx={ctx} />
				<SingleRow
					ctx={ctx}
					paramKey={ROTATE}
					label="Rotation"
					factor={1}
					decimals={1}
					suffix="°"
					iconLabel="∠"
				/>
			</FxGroup>
			<FxGroup title="Opacity">
				<SingleRow
					ctx={ctx}
					paramKey={OPACITY}
					label="Opacity"
					factor={100}
					decimals={0}
					suffix="%"
					iconLabel="O"
				/>
			</FxGroup>
			<p className="text-muted-foreground px-1 pt-2 text-[0.65rem]">
				Drag a blue value to scrub it, click to type. The diamond sets a
				keyframe at the playhead — open the clip's keyframe lanes on the
				timeline to fine-tune curves.
			</p>
		</div>
	);
}
