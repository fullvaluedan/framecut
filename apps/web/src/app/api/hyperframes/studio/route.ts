import { NextRequest, NextResponse } from "next/server";
import { startStudio } from "@framecut/hf-bridge";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Starts (or reuses) the local HyperFrames Studio server for one AI clip's
 * comp source and returns its URL. The client opens it in a new tab.
 */
export async function POST(req: NextRequest) {
	const body = (await req.json()) as { compId?: string };
	if (typeof body?.compId !== "string" || !/^[\w-]+$/.test(body.compId)) {
		return NextResponse.json({ error: "Invalid compId" }, { status: 400 });
	}
	try {
		const { url } = await startStudio({ compId: body.compId });
		return NextResponse.json({ url });
	} catch (e) {
		return NextResponse.json(
			{ error: `Studio failed to start: ${e instanceof Error ? e.message : String(e)}` },
			{ status: 500 },
		);
	}
}
