import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * Converts any video the browser can't decode (HEVC, 10-bit, etc.) into an
 * editing-friendly H.264 MP4 using the ffmpeg installed on this computer.
 * Body: raw video bytes. Query: ?name=<original filename>.
 */
export async function POST(req: NextRequest) {
	const name = req.nextUrl.searchParams.get("name") ?? "video";
	const bytes = Buffer.from(await req.arrayBuffer());
	if (!bytes.length) {
		return NextResponse.json({ error: "Empty body" }, { status: 400 });
	}

	const dir = await mkdtemp(path.join(os.tmpdir(), "vibecut-transcode-"));
	const inPath = path.join(dir, `in${path.extname(name) || ".bin"}`);
	const outPath = path.join(dir, "out.mp4");

	try {
		await writeFile(inPath, bytes);
		const result = await new Promise<{ code: number; log: string }>(
			(resolve, reject) => {
				const child = spawn(
					"ffmpeg",
					[
						"-y",
						"-i",
						inPath,
						"-c:v",
						"libx264",
						"-preset",
						"veryfast",
						"-crf",
						"20",
						"-pix_fmt",
						"yuv420p",
						"-c:a",
						"aac",
						"-movflags",
						"+faststart",
						outPath,
					],
					{ shell: true, stdio: ["ignore", "pipe", "pipe"] },
				);
				let log = "";
				child.stdout.on("data", (d) => (log += d.toString()));
				child.stderr.on("data", (d) => (log += d.toString()));
				child.on("error", reject);
				child.on("close", (code) => resolve({ code: code ?? 1, log }));
			},
		);
		if (result.code !== 0) {
			return NextResponse.json(
				{ error: `ffmpeg failed: ${result.log.slice(-800)}` },
				{ status: 500 },
			);
		}
		const out = await readFile(outPath);
		return new NextResponse(new Uint8Array(out), {
			headers: { "content-type": "video/mp4" },
		});
	} catch (e) {
		return NextResponse.json(
			{ error: e instanceof Error ? e.message : String(e) },
			{ status: 500 },
		);
	} finally {
		await rm(dir, { recursive: true, force: true }).catch(() => undefined);
	}
}
