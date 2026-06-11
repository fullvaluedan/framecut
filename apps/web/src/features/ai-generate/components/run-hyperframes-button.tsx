"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
	TooltipProvider,
} from "@/components/ui/tooltip";
import { useEditor } from "@/editor/use-editor";
import {
	runHyperframes,
	type RunProgress,
} from "@/features/ai-generate/run-hyperframes";
import { HugeiconsIcon } from "@hugeicons/react";
import { MagicWand05Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

export function RunHyperframesButton() {
	const editor = useEditor();
	const [progress, setProgress] = useState<RunProgress | null>(null);
	const isRunning =
		progress !== null && progress.stage !== "done" && progress.stage !== "error";

	const handleRun = async () => {
		if (isRunning) return;
		try {
			const result = await runHyperframes({
				editor,
				onProgress: setProgress,
			});
			toast.success(
				`HyperFrames placed ${result.placed} effect${result.placed === 1 ? "" : "s"} on the timeline`,
				result.skipped.length
					? { description: `${result.skipped.length} skipped — see console.` }
					: undefined,
			);
			if (result.skipped.length) {
				console.warn("HyperFrames skipped effects:", result.skipped);
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			toast.error("HyperFrames run failed", { description: message });
			setProgress({ stage: "error", detail: message });
		} finally {
			setTimeout(() => setProgress(null), 1500);
		}
	};

	const renderProgressFraction = () => {
		if (!progress) return 0;
		switch (progress.stage) {
			case "extracting":
				return 0.05;
			case "loading-model":
				return 0.05 + 0.15 * (progress.progress ?? 0);
			case "transcribing":
				return 0.3;
			case "planning":
				return 0.45;
			case "rendering":
			case "placing": {
				const i = progress.effectIndex ?? 0;
				const n = Math.max(progress.effectCount ?? 1, 1);
				return 0.5 + 0.5 * (i / n);
			}
			case "done":
				return 1;
			default:
				return 0;
		}
	};

	return (
		<TooltipProvider delayDuration={300}>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="default"
						size="sm"
						disabled={isRunning}
						onClick={handleRun}
						className={cn("gap-1.5 rounded-sm font-semibold", isRunning && "opacity-90")}
					>
						<HugeiconsIcon icon={MagicWand05Icon} size={14} />
						{isRunning ? "RUNNING..." : "RUN HYPERFRAMES"}
					</Button>
				</TooltipTrigger>
				<TooltipContent className="max-w-72">
					{isRunning && progress ? (
						<div className="flex w-56 flex-col gap-1.5">
							<span className="text-xs">{progress.detail}</span>
							<Progress value={renderProgressFraction() * 100} />
						</div>
					) : (
						"Transcribe the timeline and let Claude add HyperFrames motion graphics"
					)}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
