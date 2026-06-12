"use client";

import { useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { useActionHandler } from "@/actions/use-action-handler";
import { cn } from "@/utils/ui";
import { type Tab, useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { TabBar } from "./tabbar";
import { Captions } from "@/subtitles/components/assets-view";
import { MediaView } from "./views/assets";
import { SettingsView } from "./views/settings";
import { SoundsView } from "@/sounds/components/assets-view";
import { ShapesView } from "@/graphics/components/assets-view";
import { TextView } from "@/text/components/assets-view";
import { EffectsView } from "@/effects/components/assets-view";
import { HyperframesPanel } from "@/features/ai-generate/components/hyperframes-panel";

export function AssetsPanel() {
	const { activeTab, isMaximized, toggleMaximized, setMaximized } =
		useAssetsPanelStore();

	useActionHandler("toggle-panel-maximize", () => toggleMaximized(), undefined);
	useEffect(() => {
		if (!isMaximized) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMaximized(false);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [isMaximized, setMaximized]);

	const viewMap: Record<Tab, React.ReactNode> = {
		media: <MediaView />,
		hyperframes: <HyperframesPanel />,
		sounds: <SoundsView />,
		text: <TextView />,
		shapes: <ShapesView />,
		effects: <EffectsView />,
		transitions: (
			<div className="text-muted-foreground p-4">
				Transitions view coming soon...
			</div>
		),
		captions: <Captions />,
		adjustment: (
			<div className="text-muted-foreground p-4">
				Adjustment view coming soon...
			</div>
		),
		settings: <SettingsView />,
	};

	return (
		<div
			className={cn(
				"panel bg-background flex rounded-sm border overflow-hidden",
				isMaximized ? "fixed inset-2 z-50 shadow-2xl" : "h-full",
			)}
		>
			<TabBar />
			<Separator orientation="vertical" />
			<div className="flex-1 overflow-hidden">{viewMap[activeTab]}</div>
		</div>
	);
}
