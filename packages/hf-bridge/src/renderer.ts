import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getTemplate } from "./templates/index";
import type { RenderJob, RenderOutcome } from "./types";

/**
 * Locates the pinned hyperframes package by walking up from cwd.
 * Deliberately avoids require()/import so bundlers (Turbopack dev) never
 * try to statically analyze the lookup.
 */
export function findHyperframesPackageDir(): string {
	let dir = process.cwd();
	for (let i = 0; i < 8; i++) {
		// Hoisted layout (npm/pnpm) and bun's isolated layout for this package.
		const candidates = [
			path.join(dir, "node_modules", "hyperframes"),
			path.join(dir, "packages", "hf-bridge", "node_modules", "hyperframes"),
		];
		// Bun's content store: node_modules/.bun/hyperframes@<version>/node_modules/hyperframes
		const bunStore = path.join(dir, "node_modules", ".bun");
		if (existsSync(bunStore)) {
			for (const entry of readdirSync(bunStore)) {
				if (entry.startsWith("hyperframes@")) {
					candidates.push(
						path.join(bunStore, entry, "node_modules", "hyperframes"),
					);
				}
			}
		}
		for (const candidate of candidates) {
			if (existsSync(path.join(candidate, "package.json"))) {
				return candidate;
			}
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	throw new Error(
		"hyperframes package not found in node_modules — run `bun install` in the repo root",
	);
}

function resolveHyperframesCli(): string {
	const pkgDir = findHyperframesPackageDir();
	const pkg = JSON.parse(
		readFileSync(path.join(pkgDir, "package.json"), "utf8"),
	) as { bin?: string | Record<string, string> };
	const binRel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.hyperframes;
	if (!binRel) {
		throw new Error("hyperframes package has no bin entry");
	}
	return path.join(pkgDir, binRel);
}

/** Comp sources persist here so re-renders/template swaps never lose them. */
export function generatedRoot(): string {
	return path.join(os.homedir(), ".framecut", "generated");
}

/** The web app may run under Bun; the hyperframes CLI needs real Node. */
function nodeBinary(): string {
	if (process.env.FRAMECUT_NODE) return process.env.FRAMECUT_NODE;
	const isBun = path.basename(process.execPath).toLowerCase().startsWith("bun");
	return isBun ? "node" : process.execPath;
}

function runNode(args: string[], cwd: string): Promise<{ code: number; output: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(nodeBinary(), args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, NO_COLOR: "1" },
		});
		let output = "";
		child.stdout.on("data", (d) => (output += d.toString()));
		child.stderr.on("data", (d) => (output += d.toString()));
		child.on("error", reject);
		child.on("close", (code) => resolve({ code: code ?? 1, output }));
	});
}

/**
 * Renders one template instance to a transparent WebM.
 * Scaffolds a persistent comp dir, writes index.html + vars.json, then runs
 * the pinned hyperframes CLI: render --format webm.
 */
export async function renderTemplateJob(job: RenderJob): Promise<RenderOutcome> {
	const template = getTemplate(job.templateId);
	if (!template) {
		throw new Error(`Unknown template: ${job.templateId}`);
	}

	const durationSec = Math.min(
		Math.max(job.durationSec, template.minDurationSec),
		template.maxDurationSec,
	);

	const compId = randomUUID();
	const compDir = path.join(generatedRoot(), compId);
	await mkdir(compDir, { recursive: true });

	const html = template.buildCompHtml({
		width: job.width,
		height: job.height,
		durationSec,
	});
	await writeFile(path.join(compDir, "index.html"), html, "utf8");
	await writeFile(
		path.join(compDir, "vars.json"),
		JSON.stringify(job.variables, null, 2),
		"utf8",
	);
	await writeFile(
		path.join(compDir, "framecut.json"),
		JSON.stringify(
			{
				templateId: job.templateId,
				durationSec,
				fps: job.fps,
				width: job.width,
				height: job.height,
				variables: job.variables,
				createdAt: new Date().toISOString(),
			},
			null,
			2,
		),
		"utf8",
	);

	const cli = resolveHyperframesCli();
	const outPath = path.join(compDir, "out.webm");
	const { code, output } = await runNode(
		[
			cli,
			"render",
			"--format",
			"webm",
			"--quality",
			"standard",
			"--fps",
			String(job.fps),
			"--variables-file",
			"vars.json",
			"--output",
			outPath,
		],
		compDir,
	);

	if (code !== 0 || !existsSync(outPath)) {
		throw new Error(
			`hyperframes render failed (exit ${code}):\n${output.slice(-4000)}`,
		);
	}

	return { videoPath: outPath, compDir };
}
