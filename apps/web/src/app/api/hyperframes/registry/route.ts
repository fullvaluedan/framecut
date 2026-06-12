import { NextResponse } from "next/server";

export const runtime = "nodejs";

const REGISTRY_URL =
	"https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/registry.json";
const CACHE_MS = 60 * 60 * 1000;

interface RegistryItem {
	name: string;
	type: string;
}

let cache: { at: number; items: RegistryItem[] } | null = null;

/** Lists every asset in the official HyperFrames registry (cached 1h). */
export async function GET() {
	if (cache && Date.now() - cache.at < CACHE_MS) {
		return NextResponse.json({ items: cache.items });
	}
	try {
		const res = await fetch(REGISTRY_URL, {
			signal: AbortSignal.timeout(10000),
		});
		if (!res.ok) throw new Error(`registry ${res.status}`);
		const data = (await res.json()) as { items?: RegistryItem[] };
		const items = (data.items ?? []).filter(
			(item) => typeof item?.name === "string" && typeof item?.type === "string",
		);
		cache = { at: Date.now(), items };
		return NextResponse.json({ items });
	} catch (e) {
		return NextResponse.json(
			{
				items: [],
				error: `Could not reach the HyperFrames registry: ${e instanceof Error ? e.message : String(e)}`,
			},
			{ status: 200 },
		);
	}
}
