import type { FrameRate } from "opencut-wasm";
import { EXPORT_MIME_TYPES } from "./mime-types";

export const EXPORT_QUALITY_VALUES = [
	"low",
	"medium",
	"high",
	"very_high",
] as const;

export const EXPORT_FORMAT_VALUES = ["mp4", "webm"] as const;

export type ExportFormat = (typeof EXPORT_FORMAT_VALUES)[number];
export type ExportQuality = (typeof EXPORT_QUALITY_VALUES)[number];

export interface ExportOptions {
	format: ExportFormat;
	quality: ExportQuality;
	fps?: FrameRate;
	includeAudio?: boolean;
}

export interface ExportResult {
	success: boolean;
	buffer?: ArrayBuffer;
	error?: string;
	cancelled?: boolean;
}

export interface ExportState {
	isExporting: boolean;
	progress: number;
	result: ExportResult | null;
}

export function getExportMimeType({
	format,
}: {
	format: ExportFormat;
}): string {
	return EXPORT_MIME_TYPES[format];
}

export function getExportFileExtension({
	format,
}: {
	format: ExportFormat;
}): string {
	return `.${format}`;
}

export function downloadBuffer({
	buffer,
	filename,
	mimeType,
}: {
	buffer: ArrayBuffer;
	filename: string;
	mimeType: string;
}): void {
	const blob = new Blob([buffer], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const downloadLink = document.createElement("a");
	downloadLink.href = url;
	downloadLink.download = filename;
	document.body.appendChild(downloadLink);
	downloadLink.click();
	document.body.removeChild(downloadLink);
	URL.revokeObjectURL(url);
}

/**
 * Save with a real "where do I put this?" dialog (Chromium's File System
 * Access API). The `id` makes the browser REMEMBER the last directory you
 * exported to and default there next time. Falls back to a plain download
 * where the API is unavailable; cancelling saves nothing.
 */
export async function saveBufferWithPicker({
	buffer,
	filename,
	mimeType,
}: {
	buffer: ArrayBuffer;
	filename: string;
	mimeType: string;
}): Promise<"saved" | "cancelled" | "downloaded"> {
	const picker = (
		window as unknown as {
			showSaveFilePicker?: (options: {
				id?: string;
				suggestedName?: string;
				types?: { description: string; accept: Record<string, string[]> }[];
			}) => Promise<FileSystemFileHandle>;
		}
	).showSaveFilePicker;
	if (!picker) {
		downloadBuffer({ buffer, filename, mimeType });
		return "downloaded";
	}
	try {
		const extension = filename.includes(".")
			? `.${filename.split(".").pop()}`
			: ".mp4";
		const handle = await picker({
			id: "vibecut-export",
			suggestedName: filename,
			types: [{ description: "Video", accept: { [mimeType]: [extension] } }],
		});
		const writable = await handle.createWritable();
		await writable.write(new Blob([buffer], { type: mimeType }));
		await writable.close();
		return "saved";
	} catch (e) {
		if (e instanceof DOMException && e.name === "AbortError") {
			return "cancelled";
		}
		// Picker failed for another reason — don't lose the render.
		downloadBuffer({ buffer, filename, mimeType });
		return "downloaded";
	}
}
