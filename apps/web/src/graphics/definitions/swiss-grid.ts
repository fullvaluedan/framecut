import type { ParamDefinition } from "@/params";
import type { GraphicDefinition } from "../types";

/**
 * Swiss-grid layout plate: a full-frame design surface — solid background,
 * thin grid rules, an accent bar — with a TRANSPARENT cell (the "window")
 * where the scaled-down video shows through from the track below. Cell
 * geometry is normalized (0–100% of the frame) and fully adjustable.
 */

interface SwissGridParams {
	background: string;
	lineColor: string;
	accent: string;
	cellX: number;
	cellY: number;
	cellWidth: number;
	cellHeight: number;
	columns: number;
}

const SWISS_GRID_PARAMS: ParamDefinition<keyof SwissGridParams & string>[] = [
	{
		key: "background",
		label: "Background",
		type: "color",
		default: "#101114",
	},
	{
		key: "lineColor",
		label: "Grid lines",
		type: "color",
		default: "#2a2c33",
	},
	{
		key: "accent",
		label: "Accent",
		type: "color",
		default: "#ff5c29",
	},
	{
		key: "cellX",
		label: "Window X %",
		type: "number",
		default: 42,
		min: 0,
		max: 100,
		step: 1,
		shortLabel: "X",
	},
	{
		key: "cellY",
		label: "Window Y %",
		type: "number",
		default: 12,
		min: 0,
		max: 100,
		step: 1,
		shortLabel: "Y",
	},
	{
		key: "cellWidth",
		label: "Window width %",
		type: "number",
		default: 52,
		min: 5,
		max: 100,
		step: 1,
		shortLabel: "W",
	},
	{
		key: "cellHeight",
		label: "Window height %",
		type: "number",
		default: 62,
		min: 5,
		max: 100,
		step: 1,
		shortLabel: "H",
	},
	{
		key: "columns",
		label: "Columns",
		type: "number",
		default: 12,
		min: 0,
		max: 24,
		step: 1,
		shortLabel: "C",
	},
];

export const swissGridGraphicDefinition: GraphicDefinition = {
	id: "swiss-grid",
	name: "Swiss grid",
	keywords: ["swiss", "grid", "layout", "frame", "plate"],
	params: SWISS_GRID_PARAMS,
	render({ ctx, params, width, height }) {
		const background = String(params.background ?? "#101114");
		const lineColor = String(params.lineColor ?? "#2a2c33");
		const accent = String(params.accent ?? "#ff5c29");
		const cellX = (Number(params.cellX ?? 42) / 100) * width;
		const cellY = (Number(params.cellY ?? 12) / 100) * height;
		const cellWidth = (Number(params.cellWidth ?? 52) / 100) * width;
		const cellHeight = (Number(params.cellHeight ?? 62) / 100) * height;
		const columns = Math.max(0, Math.round(Number(params.columns ?? 12)));
		const margin = width * 0.04;

		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = background;
		ctx.fillRect(0, 0, width, height);

		// Thin Swiss column rules across the whole plate.
		if (columns > 0) {
			ctx.strokeStyle = lineColor;
			ctx.lineWidth = Math.max(1, width / 1500);
			for (let i = 1; i < columns; i++) {
				const x = margin + ((width - margin * 2) / columns) * i;
				ctx.beginPath();
				ctx.moveTo(x, margin);
				ctx.lineTo(x, height - margin);
				ctx.stroke();
			}
			ctx.beginPath();
			ctx.rect(margin, margin, width - margin * 2, height - margin * 2);
			ctx.stroke();
		}

		// Accent bar, top-left — classic Swiss anchor.
		ctx.fillStyle = accent;
		ctx.fillRect(margin, margin, width * 0.14, height * 0.012);

		// The video window: punched fully transparent, with a hairline frame.
		ctx.clearRect(cellX, cellY, cellWidth, cellHeight);
		ctx.strokeStyle = accent;
		ctx.lineWidth = Math.max(1.5, width / 900);
		ctx.strokeRect(cellX, cellY, cellWidth, cellHeight);
	},
};
