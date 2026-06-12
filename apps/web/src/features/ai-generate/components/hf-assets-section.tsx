"use client";

/**
 * HyperFrames asset browser for the Effects tab: the 5 parametrized
 * templates (checkboxes drive RUN HYPERFRAMES today) plus everything in
 * the official HyperFrames registry — examples, blocks, components —
 * with persisted check/uncheck preferences for upcoming planner support.
 */

import { useEffect, useState } from "react";
import { describeTemplateCatalog } from "@framecut/hf-bridge/templates";
import { Checkbox } from "@/components/ui/checkbox";
import { useAiSettingsStore } from "@/features/ai-generate/store";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";

interface RegistryItem {
	name: string;
	type: string;
}

function groupLabel(type: string): string {
	const kind = type.split(":")[1] ?? type;
	const labels: Record<string, string> = {
		example: "Example styles",
		block: "Blocks",
		component: "Components",
	};
	return labels[kind] ?? `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`;
}

export function HfAssetsSection() {
	const disabledTemplateIds = useAiSettingsStore((s) => s.disabledTemplateIds);
	const toggleTemplate = useAiSettingsStore((s) => s.toggleTemplate);
	const disabledHfAssets = useAiSettingsStore((s) => s.disabledHfAssets);
	const toggleHfAsset = useAiSettingsStore((s) => s.toggleHfAsset);
	const [open, setOpen] = useState(true);
	const [registry, setRegistry] = useState<RegistryItem[] | null>(null);
	const [registryError, setRegistryError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch("/api/hyperframes/registry")
			.then((res) => res.json())
			.then((data: { items: RegistryItem[]; error?: string }) => {
				if (cancelled) return;
				setRegistry(data.items);
				if (data.error) setRegistryError(data.error);
			})
			.catch(() => {
				if (!cancelled) setRegistryError("Could not load the registry.");
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const templates = describeTemplateCatalog();
	const grouped = new Map<string, RegistryItem[]>();
	for (const item of registry ?? []) {
		const key = groupLabel(item.type);
		grouped.set(key, [...(grouped.get(key) ?? []), item]);
	}

	return (
		<div className="mb-3 border-b pb-3">
			<button
				type="button"
				className="flex w-full items-center gap-1.5 py-1 text-left"
				onClick={() => setOpen((o) => !o)}
			>
				<HugeiconsIcon
					icon={open ? ArrowDown01Icon : ArrowRight01Icon}
					size={14}
					className="text-muted-foreground"
				/>
				<span className="text-xs font-semibold">HyperFrames assets</span>
			</button>
			{open && (
				<div className="flex flex-col gap-3 pt-1">
					<div>
						<p className="text-muted-foreground mb-1 text-[0.65rem] font-medium uppercase">
							Templates — used by RUN HYPERFRAMES
						</p>
						{templates.map((t) => (
							<label
								key={t.id}
								className="flex cursor-pointer items-center gap-2 py-0.5 text-xs"
							>
								<Checkbox
									checked={!disabledTemplateIds.includes(t.id)}
									onCheckedChange={() => toggleTemplate(t.id)}
								/>
								<span className="truncate" title={t.description}>
									{t.name}
								</span>
							</label>
						))}
					</div>
					{[...grouped.entries()].map(([label, items]) => (
						<div key={label}>
							<p className="text-muted-foreground mb-1 text-[0.65rem] font-medium uppercase">
								{label}
							</p>
							{items.map((item) => (
								<label
									key={item.name}
									className="flex cursor-pointer items-center gap-2 py-0.5 text-xs"
								>
									<Checkbox
										checked={!disabledHfAssets.includes(item.name)}
										onCheckedChange={() => toggleHfAsset(item.name)}
									/>
									<span className="truncate">{item.name}</span>
								</label>
							))}
						</div>
					))}
					{registry === null && !registryError && (
						<p className="text-muted-foreground text-[0.65rem]">
							Loading the HyperFrames registry...
						</p>
					)}
					{registryError && (
						<p className="text-muted-foreground text-[0.65rem]">
							{registryError}
						</p>
					)}
					<p className="text-muted-foreground text-[0.65rem]">
						Template checkboxes control what RUN HYPERFRAMES can use today.
						Registry picks are saved as your palette for upcoming releases
						that render blocks and components directly.
					</p>
				</div>
			)}
		</div>
	);
}
