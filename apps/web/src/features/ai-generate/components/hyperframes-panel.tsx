"use client";

/**
 * The HyperFrames asset home (left sidebar tab): every template, style,
 * block, and component in one place — collapsible sections, visual
 * previews, grid/list views, and persisted checkboxes that pick your
 * palette. Template checkboxes gate RUN HYPERFRAMES today; registry picks
 * are the palette for releases that render blocks/components directly.
 */

import { useEffect, useState } from "react";
import { describeTemplateCatalog } from "@framecut/hf-bridge/templates";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useAiSettingsStore } from "@/features/ai-generate/store";
import { VIBE_STYLES } from "@/features/ai-generate/styles";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowDown01Icon,
	ArrowRight01Icon,
	GridViewIcon,
	LeftToRightListDashIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

interface RegistryAsset {
	name: string;
	type: string;
	title: string;
	description: string;
	previewVideo: string | null;
	previewPoster: string | null;
	durationSec: number | null;
}

interface BrowserItem {
	id: string;
	title: string;
	description: string;
	checked: boolean;
	onToggle: () => void;
	/** Local looping demo (templates). */
	demoSrc?: string;
	previewVideo?: string | null;
	previewPoster?: string | null;
}

function Section({
	title,
	subtitle,
	items,
	view,
}: {
	title: string;
	subtitle?: string;
	items: BrowserItem[];
	view: "grid" | "list";
}) {
	const [open, setOpen] = useState(true);
	const checkedCount = items.filter((i) => i.checked).length;
	return (
		<div className="border-b pb-2">
			<button
				type="button"
				className="flex w-full items-center gap-1.5 py-2 text-left"
				onClick={() => setOpen((o) => !o)}
			>
				<HugeiconsIcon
					icon={open ? ArrowDown01Icon : ArrowRight01Icon}
					size={14}
					className="text-muted-foreground"
				/>
				<span className="text-xs font-semibold">{title}</span>
				<span className="text-muted-foreground text-[0.65rem]">
					{checkedCount}/{items.length}
				</span>
				{subtitle && (
					<span className="text-muted-foreground ml-auto truncate text-[0.6rem]">
						{subtitle}
					</span>
				)}
			</button>
			{open &&
				(view === "grid" ? (
					<div
						className="grid gap-2"
						style={{
							gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))",
						}}
					>
						{items.map((item) => (
							<GridCard key={item.id} item={item} />
						))}
					</div>
				) : (
					<div className="flex flex-col">
						{items.map((item) => (
							<ListRow key={item.id} item={item} />
						))}
					</div>
				))}
		</div>
	);
}

function Preview({
	item,
	className,
}: {
	item: BrowserItem;
	className?: string;
}) {
	const [hovered, setHovered] = useState(false);
	const base = cn("bg-black/40 overflow-hidden rounded", className);
	if (item.demoSrc) {
		return (
			<video
				src={item.demoSrc}
				className={cn(base, "object-cover")}
				autoPlay
				loop
				muted
				playsInline
			/>
		);
	}
	if (item.previewVideo && hovered) {
		return (
			<video
				src={item.previewVideo}
				poster={item.previewPoster ?? undefined}
				className={cn(base, "object-cover")}
				autoPlay
				loop
				muted
				playsInline
				onMouseLeave={() => setHovered(false)}
			/>
		);
	}
	if (item.previewPoster) {
		return (
			// eslint-disable-next-line @next/next/no-img-element -- remote registry preview, unknown domains
			<img
				src={item.previewPoster}
				alt={item.title}
				loading="lazy"
				className={cn(base, "object-cover")}
				onMouseEnter={item.previewVideo ? () => setHovered(true) : undefined}
			/>
		);
	}
	return (
		<div className={cn(base, "flex items-center justify-center")}>
			<span className="text-muted-foreground select-none px-1 text-center text-[0.6rem]">
				{item.title}
			</span>
		</div>
	);
}

function GridCard({ item }: { item: BrowserItem }) {
	return (
		<label
			className={cn(
				"flex cursor-pointer flex-col gap-1 rounded-md border p-1.5 transition-colors",
				item.checked ? "border-foreground/20" : "border-transparent opacity-50",
			)}
			title={item.description || item.title}
		>
			<Preview item={item} className="aspect-video w-full" />
			<div className="flex items-center gap-1.5">
				<Checkbox checked={item.checked} onCheckedChange={item.onToggle} />
				<span className="truncate text-xs">{item.title}</span>
			</div>
		</label>
	);
}

function ListRow({ item }: { item: BrowserItem }) {
	return (
		<label
			className={cn(
				"flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-foreground/5",
				!item.checked && "opacity-50",
			)}
			title={item.description || item.title}
		>
			<Checkbox checked={item.checked} onCheckedChange={item.onToggle} />
			<Preview item={item} className="h-8 w-14 shrink-0" />
			<div className="min-w-0">
				<div className="truncate text-xs">{item.title}</div>
				{item.description && (
					<div className="text-muted-foreground truncate text-[0.6rem]">
						{item.description}
					</div>
				)}
			</div>
		</label>
	);
}

export function HyperframesPanel() {
	const disabledTemplateIds = useAiSettingsStore((s) => s.disabledTemplateIds);
	const toggleTemplate = useAiSettingsStore((s) => s.toggleTemplate);
	const disabledHfAssets = useAiSettingsStore((s) => s.disabledHfAssets);
	const toggleHfAsset = useAiSettingsStore((s) => s.toggleHfAsset);
	const styleId = useAiSettingsStore((s) => s.styleId);
	const setStyleId = useAiSettingsStore((s) => s.setStyleId);
	const hfDirection = useAiSettingsStore((s) => s.hfDirection);
	const setHfDirection = useAiSettingsStore((s) => s.setHfDirection);
	const tokensUsedTotal = useAiSettingsStore((s) => s.tokensUsedTotal);
	const view = useAiSettingsStore((s) => s.hfBrowserView);
	const setView = useAiSettingsStore((s) => s.setHfBrowserView);

	const [registry, setRegistry] = useState<RegistryAsset[]>([]);
	const [registryError, setRegistryError] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		fetch("/api/hyperframes/registry")
			.then((res) => res.json())
			.then((data: { items: RegistryAsset[]; error?: string }) => {
				if (cancelled) return;
				setRegistry(data.items ?? []);
				if (data.error) setRegistryError(data.error);
			})
			.catch(() => {
				if (!cancelled) setRegistryError("Could not load the registry.");
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const templateItems: BrowserItem[] = describeTemplateCatalog().map((t) => ({
		id: t.id,
		title: t.name,
		description: t.description,
		checked: !disabledTemplateIds.includes(t.id),
		onToggle: () => toggleTemplate(t.id),
		demoSrc: `/hf-demos/${t.id}.webm`,
	}));
	const registryItems = (kind: string): BrowserItem[] =>
		registry
			.filter((a) => a.type === `hyperframes:${kind}`)
			.map((a) => ({
				id: a.name,
				title: a.title,
				description: a.description,
				checked: !disabledHfAssets.includes(a.name),
				onToggle: () => toggleHfAsset(a.name),
				previewVideo: a.previewVideo,
				previewPoster: a.previewPoster,
			}));

	return (
		<PanelView
			title="HyperFrames"
			actions={
				<Button
					size="icon"
					variant="ghost"
					title={view === "grid" ? "Switch to list view" : "Switch to grid view"}
					onClick={() => setView(view === "grid" ? "list" : "grid")}
				>
					<HugeiconsIcon
						icon={view === "grid" ? LeftToRightListDashIcon : GridViewIcon}
					/>
				</Button>
			}
		>
			<div className="flex flex-col gap-1 pb-4">
				<Section
					title="Templates"
					subtitle="used by RUN HYPERFRAMES"
					items={templateItems}
					view={view}
				/>
				<Section title="Styles" items={registryItems("example")} view={view} />
				<Section title="Blocks" items={registryItems("block")} view={view} />
				<Section
					title="Components"
					items={registryItems("component")}
					view={view}
				/>
				{registryError && (
					<p className="text-muted-foreground text-[0.65rem]">{registryError}</p>
				)}

				<div className="pt-2">
					<h3 className="text-xs font-semibold">Style theme</h3>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{VIBE_STYLES.map((style) => (
							<button
								key={style.id}
								type="button"
								title={`${style.name} — ${style.description}`}
								onClick={() => setStyleId(style.id)}
								className={cn(
									"size-7 rounded-full border-2 transition-transform",
									styleId === style.id
										? "scale-110 border-foreground"
										: "border-transparent hover:scale-105",
								)}
								style={{ backgroundColor: style.accent }}
							/>
						))}
					</div>
				</div>

				<div className="pt-2">
					<h3 className="text-xs font-semibold">Direction</h3>
					<textarea
						value={hfDirection}
						onChange={(e) => setHfDirection(e.target.value)}
						placeholder="Tell HyperFrames how to edit..."
						rows={3}
						className="border-input bg-background mt-2 w-full resize-y rounded-md border p-2 text-xs outline-none focus:ring-1"
					/>
				</div>

				<p className="text-muted-foreground pt-1 text-[0.65rem]">
					Checked templates are the palette RUN HYPERFRAMES picks from today;
					checked styles, blocks, and components are saved for releases that
					render them directly. Claude usage on this device: ~
					{tokensUsedTotal.toLocaleString()} tokens.
				</p>
			</div>
		</PanelView>
	);
}
