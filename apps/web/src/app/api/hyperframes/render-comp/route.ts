import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { renderCompDir } from "@framecut/hf-bridge";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * Re-renders an existing comp dir exactly as it is on disk (including any
 * edits made in HyperFrames Studio) and streams the WebM back.
 */
export async function POST(req: NextRequest) {
	const body = (await req.json()) as { compId?: string; fps?: number };
	if (typeof body?.compId !== "string" || !/^[\w-]+$/.test(body.compId)) {
		return NextResponse.json({ error: "Invalid compId" }, { status: 400 });
	}
	try {
		const { videoPath, compDir } = await renderCompDir({
			compId: body.compId,
			fps: Number.isFinite(body.fps) ? body.fps : undefined,
		});
		const bytes = await readFile(videoPath);
		return new NextResponse(new Uint8Array(bytes), {
			headers: {
				"content-type": "video/webm",
				"x-framecut-comp-id": path.basename(compDir),
			},
		});
	} catch (e) {
		return NextResponse.json(
			{ error: `Render failed: ${e instanceof Error ? e.message : String(e)}` },
			{ status: 500 },
		);
	}
}
