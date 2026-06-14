"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type PointerEvent,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { useMutation, useQuery } from "convex/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  Circle,
  Code2,
  Copy,
  Download,
  Eraser,
  Edit3,
  ExternalLink,
  FrameIcon,
  ImagePlus,
  Italic,
  Layers3,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  MoveRight,
  PenLine,
  RectangleHorizontal,
  Save,
  Slash,
  Sparkles,
  SwatchBook,
  Redo2,
  Trash2,
  Type,
  Underline,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Arrow } from "@/components/shapes/arrow";
import { Elipse } from "@/components/shapes/elipse";
import { Frame } from "@/components/shapes/frame";
import { GeneratedUI } from "@/components/shapes/generated-ui";
import { Line } from "@/components/shapes/line";
import { Rectangle } from "@/components/shapes/rectangle";
import { Stroke } from "@/components/shapes/stroke";
import { Text } from "@/components/shapes/text";
import { MoodBoardImage } from "@/components/style/mood-board/images.board";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RootState } from "@/redux/store";
import {
  clearSelection,
  copySelectedToClipboard,
  deleteSelected,
  deselectShape,
  loadProject,
  addGeneratedUI,
  pasteClipboard,
  removeShape,
  removeShapes,
  selectAll,
  selectShape,
  setTool,
  snapshotHistory,
  undo,
  redo,
  updateShape,
  type Shape,
  type Tool,
} from "@/redux/slice/shapes";
import {
  resetView,
  restoreViewport,
  screenToWorld,
  setScale,
  panStart,
} from "@/redux/slice/viewport";
import { recordAiUsage } from "@/lib/ai-usage";
import { cn } from "@/lib/utils";
import { InfiniteCanvasRenderer } from "@/components/editor/infinite-canvas-renderer";
import { useInfiniteCanvas } from "@/hooks/use-infinite-canvas";

const tools: Array<{ id: Tool; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "frame", label: "Frame", icon: FrameIcon },
  { id: "rect", label: "Rectangle", icon: RectangleHorizontal },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "line", label: "Line", icon: Slash },
  { id: "arrow", label: "Arrow", icon: MoveRight },
  { id: "freedraw", label: "Draw", icon: PenLine },
  { id: "eraser", label: "Eraser", icon: Eraser },
  { id: "text", label: "Text", icon: Type },
];

type Bounds = { x: number; y: number; w: number; h: number };
type ResizeCorner = "nw" | "ne" | "sw" | "se";

function renderShape(shape: Shape) {
  switch (shape.type) {
    case "frame":
      return <Frame key={shape.id} shape={shape} toggleInspiration={() => undefined} />;
    case "rect":
      return <Rectangle key={shape.id} shape={shape} />;
    case "ellipse":
      return <Elipse key={shape.id} shape={shape} />;
    case "line":
      return <Line key={shape.id} shape={shape} />;
    case "arrow":
      return <Arrow key={shape.id} shape={shape} />;
    case "freedraw":
      return <Stroke key={shape.id} shape={shape} />;
    case "text":
      return <Text key={shape.id} shape={shape} />;
    case "generatedui":
      return <GeneratedUI key={shape.id} shape={shape} />;
    default:
      return null;
  }
}

function shapeLabel(shape: Shape) {
  if (shape.type === "frame") return `Frame ${shape.frameNumber}`;
  if (shape.type === "text") return shape.text || "Text";
  if (shape.type === "generatedui") return "Generated UI";
  return shape.type.charAt(0).toUpperCase() + shape.type.slice(1);
}

function getShapeBounds(shape: Shape): Bounds {
  if (shape.type === "frame" || shape.type === "rect" || shape.type === "ellipse" || shape.type === "generatedui") {
    return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  }

  if (shape.type === "text") {
    const lines = shape.text.split("\n");
    const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);

    return {
      x: shape.x,
      y: shape.y,
      w: Math.max(96, longestLine * shape.fontSize * 0.58 + 24),
      h: Math.max(shape.fontSize * 1.6, lines.length * shape.fontSize * shape.lineHeight + 12),
    };
  }

  if (shape.type === "line" || shape.type === "arrow") {
    const x = Math.min(shape.startX, shape.endX) - 10;
    const y = Math.min(shape.startY, shape.endY) - 10;
    return {
      x,
      y,
      w: Math.max(20, Math.abs(shape.endX - shape.startX) + 20),
      h: Math.max(20, Math.abs(shape.endY - shape.startY) + 20),
    };
  }

  if (shape.points.length === 0) return { x: 0, y: 0, w: 20, h: 20 };

  const xs = shape.points.map((point) => point.x);
  const ys = shape.points.map((point) => point.y);
  const x = Math.min(...xs) - 10;
  const y = Math.min(...ys) - 10;

  return {
    x,
    y,
    w: Math.max(20, Math.max(...xs) - Math.min(...xs) + 20),
    h: Math.max(20, Math.max(...ys) - Math.min(...ys) + 20),
  };
}

function moveShapePatch(shape: Shape, dx: number, dy: number): Partial<Shape> {
  if (shape.type === "frame" || shape.type === "rect" || shape.type === "ellipse" || shape.type === "generatedui") {
    return { x: shape.x + dx, y: shape.y + dy } as Partial<Shape>;
  }

  if (shape.type === "text") {
    return { x: shape.x + dx, y: shape.y + dy } as Partial<Shape>;
  }

  if (shape.type === "line" || shape.type === "arrow") {
    return {
      startX: shape.startX + dx,
      startY: shape.startY + dy,
      endX: shape.endX + dx,
      endY: shape.endY + dy,
    } as Partial<Shape>;
  }

  return {
    points: shape.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  } as Partial<Shape>;
}

function boundsPatch(shape: Shape, next: Bounds, previous = getShapeBounds(shape)): Partial<Shape> {
  const normalized = {
    x: next.w < 0 ? next.x + next.w : next.x,
    y: next.h < 0 ? next.y + next.h : next.y,
    w: Math.max(8, Math.abs(next.w)),
    h: Math.max(8, Math.abs(next.h)),
  };

  if (shape.type === "frame" || shape.type === "rect" || shape.type === "ellipse" || shape.type === "generatedui") {
    return normalized as Partial<Shape>;
  }

  if (shape.type === "text") {
    return {
      x: normalized.x,
      y: normalized.y,
      fontSize: Math.max(10, Math.round(normalized.h / 1.6)),
    } as Partial<Shape>;
  }

  const scalePoint = (point: { x: number; y: number }) => ({
    x: normalized.x + ((point.x - previous.x) / Math.max(1, previous.w)) * normalized.w,
    y: normalized.y + ((point.y - previous.y) / Math.max(1, previous.h)) * normalized.h,
  });

  if (shape.type === "line" || shape.type === "arrow") {
    const start = scalePoint({ x: shape.startX, y: shape.startY });
    const end = scalePoint({ x: shape.endX, y: shape.endY });

    return {
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
    } as Partial<Shape>;
  }

  return { points: shape.points.map(scalePoint) } as Partial<Shape>;
}

function resizeBounds(bounds: Bounds, corner: ResizeCorner, dx: number, dy: number): Bounds {
  if (corner === "nw") return { x: bounds.x + dx, y: bounds.y + dy, w: bounds.w - dx, h: bounds.h - dy };
  if (corner === "ne") return { x: bounds.x, y: bounds.y + dy, w: bounds.w + dx, h: bounds.h - dy };
  if (corner === "sw") return { x: bounds.x + dx, y: bounds.y, w: bounds.w - dx, h: bounds.h + dy };
  return { x: bounds.x, y: bounds.y, w: bounds.w + dx, h: bounds.h + dy };
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function applyTextTransform(text: string, transform: Extract<Shape, { type: "text" }>["textTransform"]) {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return text;
}

function drawArrowHead(ctx: CanvasRenderingContext2D, startX: number, startY: number, endX: number, endY: number, size: number) {
  const angle = Math.atan2(endY - startY, endX - startX);

  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - size * Math.cos(angle - Math.PI / 6), endY - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - size * Math.cos(angle + Math.PI / 6), endY - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawShapeOnCanvas(ctx: CanvasRenderingContext2D, shape: Shape, frame: Extract<Shape, { type: "frame" }>) {
  const stroke = shape.stroke || "#ffffff";
  const strokeWidth = Math.max(1, shape.strokeWidth || 1);
  const fill = shape.fill ?? "transparent";

  ctx.save();
  ctx.translate(-frame.x, -frame.y);
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (shape.type === "frame" || shape.type === "rect" || shape.type === "generatedui") {
    if (fill !== "transparent") ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
    if (stroke !== "transparent" && strokeWidth > 0) ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
  }

  if (shape.type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(shape.x + shape.w / 2, shape.y + shape.h / 2, Math.abs(shape.w / 2), Math.abs(shape.h / 2), 0, 0, Math.PI * 2);
    if (fill !== "transparent") ctx.fill();
    if (stroke !== "transparent" && strokeWidth > 0) ctx.stroke();
  }

  if (shape.type === "line" || shape.type === "arrow") {
    ctx.beginPath();
    ctx.moveTo(shape.startX, shape.startY);
    ctx.lineTo(shape.endX, shape.endY);
    ctx.stroke();

    if (shape.type === "arrow") {
      drawArrowHead(ctx, shape.startX, shape.startY, shape.endX, shape.endY, Math.max(10, strokeWidth * 5));
    }
  }

  if (shape.type === "freedraw" && shape.points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(shape.points[0].x, shape.points[0].y);
    for (const point of shape.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  if (shape.type === "text") {
    const text = applyTextTransform(shape.text, shape.textTransform);
    const lines = text.split("\n");
    const lineHeightPx = shape.fontSize * shape.lineHeight;

    ctx.font = `${shape.fontStyle} ${shape.fontWeight} ${shape.fontSize}px ${shape.fontFamily}`;
    ctx.fillStyle = shape.fill || "#ffffff";
    ctx.textAlign = shape.textAlign;
    ctx.textBaseline = "top";

    const bounds = getShapeBounds(shape);
    const textX = shape.textAlign === "center" ? shape.x + bounds.w / 2 : shape.textAlign === "right" ? shape.x + bounds.w : shape.x;

    lines.forEach((line, index) => {
      const y = shape.y + index * lineHeightPx;
      ctx.fillText(line, textX, y);

      if (shape.textDecoration === "underline" || shape.textDecoration === "line-through") {
        const metrics = ctx.measureText(line);
        const width = metrics.width;
        const startX = shape.textAlign === "center" ? textX - width / 2 : shape.textAlign === "right" ? textX - width : textX;
        const lineY = shape.textDecoration === "underline" ? y + shape.fontSize + 2 : y + shape.fontSize * 0.55;
        ctx.beginPath();
        ctx.moveTo(startX, lineY);
        ctx.lineTo(startX + width, lineY);
        ctx.strokeStyle = shape.fill || "#ffffff";
        ctx.lineWidth = Math.max(1, shape.fontSize / 14);
        ctx.stroke();
      }
    });
  }

  ctx.restore();
}

async function renderFrameToPngBlob(frame: Extract<Shape, { type: "frame" }>, frameShapes: Shape[]) {
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(frame.w * pixelRatio));
  canvas.height = Math.max(1, Math.round(frame.h * pixelRatio));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas export context");

  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = frame.fill || "#0b0b0b";
  ctx.fillRect(0, 0, frame.w, frame.h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, frame.w, frame.h);
  ctx.clip();
  frameShapes.forEach((shape) => drawShapeOnCanvas(ctx, shape, frame));
  ctx.restore();

  ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, Math.max(1, frame.w - 1), Math.max(1, frame.h - 1));

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create PNG export");
  return blob;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read frame snapshot"));
    reader.readAsDataURL(blob);
  });
}

async function frameSnapshotDataUrl(frame: Extract<Shape, { type: "frame" }>, frameShapes: Shape[]) {
  return await blobToDataUrl(await renderFrameToPngBlob(frame, frameShapes));
}

async function exportFrameAsPng(frame: Extract<Shape, { type: "frame" }>, frameShapes: Shape[], filename: string) {
  downloadBlob(await renderFrameToPngBlob(frame, frameShapes), filename);
}

function sanitizeCssForPngExport(css: string) {
  return css
    .replace(/oklch\([^)]*\)/gi, "#111111")
    .replace(/color-mix\([^)]*\)/gi, "#1f1f1f")
    .replace(/lab\([^)]*\)/gi, "#111111")
    .replace(/lch\([^)]*\)/gi, "#111111");
}

async function renderGeneratedUiToPngBlob(shape: Extract<Shape, { type: "generatedui" }>) {
  const spec = generatedSpecFromValue(shape.uiSpecData);
  const width = Math.max(1, Math.round(shape.w));
  const height = Math.max(1, Math.round(shape.h));
  const html2canvas = (await import("html2canvas")).default;
  const iframe = document.createElement("iframe");
  const generatedHtml = spec?.html || spec?.code || "<div data-generated-ui></div>";
  const exportCss = sanitizeCssForPngExport(`
    * { box-sizing: border-box; }
    :root {
      --background: #0b0b0b;
      --foreground: #fafafa;
      --card: #171717;
      --card-foreground: #fafafa;
      --popover: #171717;
      --popover-foreground: #fafafa;
      --primary: #fafafa;
      --primary-foreground: #0b0b0b;
      --secondary: #262626;
      --secondary-foreground: #fafafa;
      --muted: #262626;
      --muted-foreground: #a3a3a3;
      --accent: #9db7ff;
      --accent-foreground: #0b0b0b;
      --destructive: #ef4444;
      --border: #343434;
      --input: #343434;
      --ring: #9db7ff;
      --radius: 0.625rem;
    }
    html, body { margin: 0; width: ${width}px; min-height: ${height}px; overflow: hidden; background: #0b0b0b; color: #fafafa; }
    [data-s2c-export-root], [data-s2c-export-root] * { box-sizing: border-box; }
    [data-s2c-export-root] { width: 100%; min-height: 100%; background: #0b0b0b; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    [data-s2c-export-root] [data-generated-ui] { width: 100%; min-height: 100%; }
    ${spec?.stylesheet ?? ""}
  `);

  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  iframe.style.border = "0";
  iframe.style.pointerEvents = "none";
  iframe.setAttribute("aria-hidden", "true");
  iframe.srcdoc = `<!doctype html><html><head><style>${exportCss}</style></head><body><div data-s2c-export-root="true">${generatedHtml}</div></body></html>`;

  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      window.setTimeout(resolve, 80);
    });
    await new Promise((resolve) => window.setTimeout(resolve, 120));

    const exportRoot = iframe.contentDocument?.querySelector("[data-s2c-export-root]") as HTMLElement | null;
    if (!exportRoot) throw new Error("Could not prepare generated UI PNG export");

    const canvas = await html2canvas(exportRoot, {
      backgroundColor: "#0b0b0b",
      scale: Math.min(2, window.devicePixelRatio || 1),
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      useCORS: true,
      logging: false,
    });

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not create generated UI PNG"));
      }, "image/png");
    });
  } finally {
    iframe.remove();
  }
}


function exportFilename(name: string | undefined, suffix: string, extension: string) {
  const slug = (name || "untitled-project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "untitled-project";

  return `${slug}-${suffix}.${extension}`;
}

type GeneratedUiResponse = {
  ok?: boolean;
  title?: string;
  prompt?: string;
  html?: string;
  stylesheet?: string;
  code?: string;
  fallback?: boolean;
  providerError?: string;
  streaming?: boolean;
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readableProviderError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "AI provider is unavailable");

  if (/quota|RESOURCE_EXHAUSTED|429/i.test(raw)) {
    return "Gemini quota is used up for now. Wait for the quota reset, then try again.";
  }

  if (/503|UNAVAILABLE|high demand|temporar/i.test(raw)) {
    return "Gemini is busy right now. Try again in a few minutes.";
  }

  if (/api key|provider/i.test(raw)) {
    return "Check your AI provider/API key settings and try again.";
  }

  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}

const GENERATED_UI_PREVIEW_HEADER_HEIGHT = 36;
const GENERATED_UI_MIN_WIDTH = 420;
const GENERATED_UI_MIN_HEIGHT = 260;
const GENERATED_UI_MAX_WIDTH = 1600;
const GENERATED_UI_MAX_HEIGHT = 2200;

function generatedCodePreview(value: string | null) {
  if (!value) return `<div className="bg-background..." />`;

  try {
    const spec = JSON.parse(value) as GeneratedUiResponse;
    return spec.code || spec.html || value;
  } catch {
    return value;
  }
}

function generatedSpecFromValue(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value) as GeneratedUiResponse;
  } catch {
    return { title: "Generated UI", code: value } satisfies GeneratedUiResponse;
  }
}

function generatedHtmlDocument(value: string | null) {
  if (!value) return null;

  try {
    const spec = JSON.parse(value) as GeneratedUiResponse;
    const body = spec.html || spec.code;
    if (!body) return null;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapePreviewHtml(spec.title || "FramePilot generated UI")}</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: #0b0b0b; }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
${spec.stylesheet ?? ""}
</style>
</head>
<body>
${body}
</body>
</html>`;
  } catch {
    return value;
  }
}

function generatedPreviewDocument(spec: GeneratedUiResponse) {
  const body = spec.html || spec.code || "<div data-generated-ui></div>";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
* { box-sizing: border-box; }
html, body { margin: 0; width: 100%; min-height: 0; overflow: visible; background: transparent; }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
[data-generated-ui] { width: 100%; min-height: 0; }
.container { width: 100%; margin-left: auto; margin-right: auto; }
.mx-auto { margin-left: auto; margin-right: auto; }
.grid { display: grid; }
.flex { display: flex; }
.inline-flex { display: inline-flex; }
.hidden { display: none; }
.items-start { align-items: flex-start; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.flex-wrap { flex-wrap: wrap; }
.flex-col { flex-direction: column; }
.gap-2 { gap: .5rem; }
.gap-3 { gap: .75rem; }
.gap-4 { gap: 1rem; }
.gap-6 { gap: 1.5rem; }
.gap-8 { gap: 2rem; }
.space-y-3 > * + * { margin-top: .75rem; }
.space-y-4 > * + * { margin-top: 1rem; }
.space-y-6 > * + * { margin-top: 1.5rem; }
.w-full { width: 100%; }
.h-full { height: 100%; }
.min-h-full { min-height: 100%; }
.overflow-hidden { overflow: hidden; }
.rounded-md { border-radius: .375rem; }
.rounded-lg { border-radius: .5rem; }
.rounded-xl { border-radius: .75rem; }
.rounded-2xl { border-radius: 1rem; }
.border { border: 1px solid rgba(148, 163, 184, .28); }
.p-4 { padding: 1rem; }
.p-6 { padding: 1.5rem; }
.p-8 { padding: 2rem; }
.px-4 { padding-left: 1rem; padding-right: 1rem; }
.px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
.px-8 { padding-left: 2rem; padding-right: 2rem; }
.py-3 { padding-top: .75rem; padding-bottom: .75rem; }
.py-4 { padding-top: 1rem; padding-bottom: 1rem; }
.py-12 { padding-top: 3rem; padding-bottom: 3rem; }
.py-16 { padding-top: 4rem; padding-bottom: 4rem; }
.py-20 { padding-top: 5rem; padding-bottom: 5rem; }
.text-sm { font-size: .875rem; line-height: 1.25rem; }
.text-base { font-size: 1rem; line-height: 1.5rem; }
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }
.text-xl { font-size: 1.25rem; line-height: 1.75rem; }
.text-2xl { font-size: 1.5rem; line-height: 2rem; }
.text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
.text-4xl { font-size: 2.25rem; line-height: 2.5rem; }
.text-5xl { font-size: 3rem; line-height: 1; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.leading-tight { line-height: 1.15; }
.leading-snug { line-height: 1.25; }
.leading-relaxed { line-height: 1.625; }
.text-center { text-align: center; }
.uppercase { text-transform: uppercase; }
.tracking-wide { letter-spacing: .025em; }
@media (min-width: 768px) {
  .md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .md\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .md\\:text-4xl { font-size: 2.25rem; line-height: 2.5rem; }
  .md\\:text-5xl { font-size: 3rem; line-height: 1; }
}
${spec.stylesheet ?? ""}
</style>
</head>
<body>${body}</body>
</html>`;
}

async function measureGeneratedUiSize(spec: GeneratedUiResponse, fallbackSize: { w: number; h: number }) {
  if (typeof document === "undefined" || (!spec.html && !spec.code)) return fallbackSize;

  const viewportWidth = Math.min(GENERATED_UI_MAX_WIDTH, Math.max(GENERATED_UI_MIN_WIDTH, fallbackSize.w));
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${viewportWidth}px`;
  iframe.style.height = "1px";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.border = "0";
  iframe.srcdoc = generatedPreviewDocument(spec);
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 900);
      iframe.onload = () => {
        window.clearTimeout(timeout);
        window.setTimeout(resolve, 60);
      };
    });

    const doc = iframe.contentDocument;
    if (!doc) return fallbackSize;

    const root = doc.querySelector("[data-generated-ui]") as HTMLElement | null;
    const body = doc.body;
    const html = doc.documentElement;
    const measuredWidth = Math.max(root?.scrollWidth ?? 0, body.scrollWidth, html.scrollWidth, root?.offsetWidth ?? 0);
    const measuredHeight = Math.max(root?.scrollHeight ?? 0, body.scrollHeight, html.scrollHeight, root?.offsetHeight ?? 0);

    return {
      w: Math.min(GENERATED_UI_MAX_WIDTH, Math.max(GENERATED_UI_MIN_WIDTH, Math.ceil(measuredWidth))),
      h: Math.min(
        GENERATED_UI_MAX_HEIGHT,
        Math.max(GENERATED_UI_MIN_HEIGHT, Math.ceil(measuredHeight) + GENERATED_UI_PREVIEW_HEADER_HEIGHT)
      ),
    };
  } finally {
    iframe.remove();
  }
}

function escapePreviewHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function streamingGeneratedSpec(title: string, code: string): GeneratedUiResponse {
  const safeCode = escapePreviewHtml(code || "Waiting for AI response...");
  const stylesheet = `[data-generated-ui]{width:100%;min-height:100%;background:#0b0b0b;color:#dbe7ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif;}[data-generated-ui] .stream-shell{min-height:100%;padding:28px;background:linear-gradient(135deg,#0b0b0b,#15171d);}[data-generated-ui] .stream-label{margin:0 0 12px;color:#9dbbff;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;}[data-generated-ui] pre{margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.6;color:#dbe7ff;}`;

  return {
    title,
    prompt: "Streaming generated UI from AI provider",
    stylesheet,
    html: `<div data-generated-ui><main class="stream-shell"><p class="stream-label">Streaming response</p><pre>${safeCode}</pre></main></div>`,
    code,
    streaming: true,
  };
}

const DEFAULT_WORKFLOW_PAGE_TYPES = [
  "Analytics Dashboard",
  "Account Settings",
  "User Profile",
  "Workflow Automations",
];

function parseServerEvent(block: string) {
  const event = block
    .split("\n")
    .find((line) => line.startsWith("event: "))
    ?.slice(7)
    .trim();
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .join("\n");

  if (!event || !data) return null;

  try {
    return { event, data: JSON.parse(data) as Record<string, unknown> };
  } catch {
    return null;
  }
}
function serializableSketchesData(shapesState: RootState["shapes"]) {
  return {
    shapes: shapesState.shapes,
    tool: shapesState.tool,
    selected: shapesState.selected,
    frameCounter: shapesState.frameCounter,
  };
}

function emptySketchesData() {
  return {
    shapes: { ids: [], entities: {} },
    tool: "select" as Tool,
    selected: {},
    frameCounter: 0,
  };
}
export function ProjectEditorPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId as Id<"projects">;
  const project = useQuery(api.projects.get, { id: projectId });
  const updateProject = useMutation(api.projects.update);
  const generateUploadUrl = useMutation(api.projects.generateUploadUrl);
  const clearInspirationImages = useMutation(api.projects.clearInspirationImages);
  const dispatch = useDispatch();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const lastSavedContentSnapshotRef = useRef<string | null>(null);
  const autosaveToastIdRef = useRef<string | number | null>(null);
  const [didLoadProject, setDidLoadProject] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [workflowPageType, setWorkflowPageType] = useState("Checkout");
  const [workflowPrompt, setWorkflowPrompt] = useState("");
  const [inspirationImageUrl, setInspirationImageUrl] = useState("");
  const [inspirationImages, setInspirationImages] = useState<string[]>([]);
  const [isUploadingInspiration, setIsUploadingInspiration] = useState(false);
  const [isDraggingInspiration, setIsDraggingInspiration] = useState(false);
  const inspirationInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isGeneratingWorkflow, setIsGeneratingWorkflow] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorActive, setInspectorActive] = useState(false);
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [isProjectRenameSaving, setIsProjectRenameSaving] = useState(false);
  const dragRef = useRef<{ ids: string[]; last: { x: number; y: number }; shapes: Shape[] } | null>(null);
  const resizeRef = useRef<{ id: string; corner: ResizeCorner; start: { x: number; y: number }; shape: Shape; bounds: Bounds } | null>(null);

  const shapesState = useSelector((state: RootState) => state.shapes);
  const viewport = useSelector((state: RootState) => state.viewport);
  const shapes = useMemo(
    () =>
      (shapesState.shapes.ids as string[])
        .map((id) => shapesState.shapes.entities[id])
        .filter(Boolean) as Shape[],
    [shapesState.shapes]
  );
  const selectedIds = Object.keys(shapesState.selected);
  const selectedShape = selectedIds.length === 1 ? shapesState.shapes.entities[selectedIds[0]] : null;
  const selectedShapes = selectedIds
    .map((id) => shapesState.shapes.entities[id])
    .filter(Boolean) as Shape[];
  const selectedBounds = selectedShape ? getShapeBounds(selectedShape) : null;
  const selectedFrame = selectedShape?.type === "frame" ? selectedShape : null;
  const selectedGeneratedUi = selectedShape?.type === "generatedui" ? selectedShape : null;
  const generationImageReferences = useMemo(
    () => Array.from(new Set([...(project?.moodBoardImages ?? []), ...inspirationImages])).slice(0, 8),
    [inspirationImages, project?.moodBoardImages]
  );
  const resolvedGenerationImages = useQuery(
    api.projects.resolveImageUrls,
    generationImageReferences.length > 0 ? { values: generationImageReferences } : "skip"
  );
  const infiniteCanvas = useInfiniteCanvas({
    viewportRef,
    viewport,
    tool: shapesState.tool,
    spacePressed,
    dispatch,
  });
  const { draft, screenPoint } = infiniteCanvas;

  useEffect(() => {
    if (project?.name && !isRenamingProject) setProjectNameDraft(project.name);
  }, [isRenamingProject, project?.name]);

  useEffect(() => {
    setInspirationImages(project?.inspirationImages ?? []);
  }, [project?.inspirationImages]);

  const canvasCenterScreen = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      x: rect ? rect.width / 2 : 500,
      y: rect ? rect.height / 2 : 320,
    };
  }, []);

  useEffect(() => {
    setDidLoadProject(false);
    lastSavedSnapshotRef.current = null;
    lastSavedContentSnapshotRef.current = null;
  }, [projectId]);

  useEffect(() => {
    if (!project || didLoadProject) return;

    const savedSketches = project.sketchesData as Partial<typeof shapesState> | undefined;
    const savedViewport = project.viewportData as { scale?: number; translate?: { x: number; y: number } } | undefined;
    const hasSavedSketches = Boolean(
      savedSketches?.shapes &&
        savedSketches.tool &&
        savedSketches.selected &&
        typeof savedSketches.frameCounter === "number"
    );
    const initialSketchesData = hasSavedSketches
      ? {
          shapes: savedSketches!.shapes!,
          tool: savedSketches!.tool!,
          selected: savedSketches!.selected!,
          frameCounter: savedSketches!.frameCounter!,
        }
      : emptySketchesData();

    dispatch(loadProject(initialSketchesData));

    if (savedViewport?.scale && savedViewport.translate) {
      dispatch(restoreViewport({ scale: savedViewport.scale, translate: savedViewport.translate }));
    } else {
      dispatch(resetView());
    }

    const initialViewportData = savedViewport?.scale && savedViewport.translate
      ? { scale: savedViewport.scale, translate: savedViewport.translate }
      : { scale: viewport.scale, translate: viewport.translate };

    lastSavedContentSnapshotRef.current = JSON.stringify(initialSketchesData);
    lastSavedSnapshotRef.current = JSON.stringify({ sketchesData: initialSketchesData, viewportData: initialViewportData });
    setDidLoadProject(true);
  }, [didLoadProject, dispatch, project, projectId, viewport.scale, viewport.translate]);


  const saveProject = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const sketchesData = serializableSketchesData(shapesState);
      const viewportData = {
        scale: viewport.scale,
        translate: viewport.translate,
      };
      const contentSnapshot = JSON.stringify(sketchesData);
      const snapshot = JSON.stringify({ sketchesData, viewportData });
      const contentChanged = contentSnapshot !== lastSavedContentSnapshotRef.current;

      if (silent && snapshot === lastSavedSnapshotRef.current) return;

      setIsSaving(true);
      setSaveStatus("saving");

      try {
        await updateProject({
          id: projectId,
          patch: {
            sketchesData,
            viewportData,
          },
        });

        lastSavedSnapshotRef.current = snapshot;
        lastSavedContentSnapshotRef.current = contentSnapshot;
        setSaveStatus("saved");

        if (!silent) {
          toast.success("Project saved");
        } else if (contentChanged) {
          autosaveToastIdRef.current = toast.success("Autosaved", {
            id: autosaveToastIdRef.current ?? "project-autosave",
            duration: 1400,
          });
        }

        if (silent && contentChanged) {
          void fetch("/api/autosave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              shapeCount: shapes.length,
              savedAt: Date.now(),
            }),
          }).catch(() => undefined);
        }
      } catch (error) {
        console.error(error);
        setSaveStatus("error");
        if (!silent) {
          toast.error("Could not save project");
        } else {
          autosaveToastIdRef.current = toast.error("Autosave failed", {
            id: autosaveToastIdRef.current ?? "project-autosave",
            duration: 2500,
          });
        }
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, shapes.length, shapesState, updateProject, viewport.scale, viewport.translate]
  );

  const onSave = useCallback(() => saveProject({ silent: false }), [saveProject]);

  useEffect(() => {
    if (selectedIds.length > 0 || inspectorActive) {
      setInspectorOpen(true);
      return;
    }

    const timeout = window.setTimeout(() => setInspectorOpen(false), 2600);
    return () => window.clearTimeout(timeout);
  }, [inspectorActive, selectedIds.length, shapesState.tool]);

  useEffect(() => {
    if (!didLoadProject || project === undefined || project === null) return;
    if (draft) return;

    const timeout = window.setTimeout(() => {
      void saveProject({ silent: true });
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [didLoadProject, draft, project, saveProject]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      if (event.key === " ") {
        event.preventDefault();
        setSpacePressed(true);
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) dispatch(redo());
        else dispatch(undo());
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch(redo());
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        dispatch(selectAll());
        dispatch(setTool("select"));
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        if (selectedIds.length > 0) {
          event.preventDefault();
          dispatch(copySelectedToClipboard());
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        dispatch(pasteClipboard());
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void onSave();
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "0") {
        event.preventDefault();
        dispatch(resetView());
      }

      if (event.key === "Escape") {
        dispatch(clearSelection());
        dispatch(setTool("select"));
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.length > 0) {
          event.preventDefault();
          dispatch(deleteSelected());
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") setSpacePressed(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [dispatch, onSave, selectedIds.length]);

  const shapesInsideBounds = useCallback(
    (container: Shape) => {
      if (!["frame", "rect", "ellipse", "generatedui"].includes(container.type)) return [];

      const containerBounds = getShapeBounds(container);
      return shapes.filter((shape) => {
        if (shape.id === container.id) return false;
        const bounds = getShapeBounds(shape);
        return (
          bounds.x >= containerBounds.x &&
          bounds.y >= containerBounds.y &&
          bounds.x + bounds.w <= containerBounds.x + containerBounds.w &&
          bounds.y + bounds.h <= containerBounds.y + containerBounds.h
        );
      });
    },
    [shapes]
  );

  const shapesInsideFrame = useCallback(
    (frame: Extract<Shape, { type: "frame" }>) => shapesInsideBounds(frame),
    [shapesInsideBounds]
  );

  const getDragShapes = (shape: Shape) => {
    if (selectedShapes.length > 1 && shapesState.selected[shape.id]) return selectedShapes;
    return [shape, ...shapesInsideBounds(shape)];
  };

  const removeShapeWithChildren = (shape: Shape) => {
    const removals = shape.type === "frame" ? [shape, ...shapesInsideFrame(shape)] : [shape];
    dispatch(removeShapes(removals.map((item) => item.id)));
  };

  const startShapeDrag = (event: PointerEvent<HTMLDivElement>, shape: Shape) => {
    if (event.button === 1 || event.button === 2 || spacePressed) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dispatch(panStart({ screen: screenPoint(event), mode: "panning" }));
      return;
    }

    if (shapesState.tool === "eraser") {
      event.preventDefault();
      event.stopPropagation();
      removeShapeWithChildren(shape);
      return;
    }

    if (shapesState.tool !== "select") return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (event.shiftKey) {
      if (shapesState.selected[shape.id]) {
        dispatch(deselectShape(shape.id));
      } else {
        dispatch(selectShape(shape.id));
      }
      return;
    }

    const dragShapes = getDragShapes(shape);
    dispatch(snapshotHistory());
    dragRef.current = {
      ids: dragShapes.map((item) => item.id),
      last: screenToWorld(screenPoint(event), viewport.translate, viewport.scale),
      shapes: dragShapes,
    };

    if (!shapesState.selected[shape.id]) {
      dispatch(clearSelection());
      dispatch(selectShape(shape.id));
    }
  };
  const startResize = (event: PointerEvent<HTMLButtonElement>, shape: Shape, corner: ResizeCorner) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dispatch(snapshotHistory());
    resizeRef.current = {
      id: shape.id,
      corner,
      start: screenToWorld(screenPoint(event), viewport.translate, viewport.scale),
      shape,
      bounds: getShapeBounds(shape),
    };
    dispatch(clearSelection());
    dispatch(selectShape(shape.id));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      const current = screenToWorld(screenPoint(event), viewport.translate, viewport.scale);
      const dx = current.x - dragRef.current.last.x;
      const dy = current.y - dragRef.current.last.y;

      dragRef.current.shapes = dragRef.current.shapes.map((shape) => {
        const patch = moveShapePatch(shape, dx, dy);
        dispatch(updateShape({ id: shape.id, patch, recordHistory: false }));
        return { ...shape, ...patch } as Shape;
      });
      dragRef.current.last = current;
      return;
    }
    if (resizeRef.current) {
      const current = screenToWorld(screenPoint(event), viewport.translate, viewport.scale);
      const dx = current.x - resizeRef.current.start.x;
      const dy = current.y - resizeRef.current.start.y;
      const nextBounds = resizeBounds(resizeRef.current.bounds, resizeRef.current.corner, dx, dy);

      dispatch(
        updateShape({
          id: resizeRef.current.id,
          patch: boundsPatch(resizeRef.current.shape, nextBounds, resizeRef.current.bounds),
          recordHistory: false,
        })
      );
      return;
    }

    infiniteCanvas.onCanvasPointerMove(event);
  };

  const endPointerOperation = () => {
    dragRef.current = null;
    resizeRef.current = null;
    infiniteCanvas.onCanvasPointerUp();
  };

  const cancelPointerOperation = () => {
    dragRef.current = null;
    resizeRef.current = null;
    infiniteCanvas.onCanvasPointerLeave();
  };

  const updateSelectedBounds = (patch: Partial<Bounds>) => {
    if (!selectedShape || !selectedBounds) return;

    dispatch(
      updateShape({
        id: selectedShape.id,
        patch: boundsPatch(selectedShape, { ...selectedBounds, ...patch }, selectedBounds),
      })
    );
  };

  const updateSelectedText = (text: string) => {
    if (!selectedShape || selectedShape.type !== "text") return;
    dispatch(updateShape({ id: selectedShape.id, patch: { text } as Partial<Shape> }));
  };

  const updateSelectedTextStyle = (patch: Partial<Extract<Shape, { type: "text" }>>) => {
    if (!selectedShape || selectedShape.type !== "text") return;
    dispatch(updateShape({ id: selectedShape.id, patch: patch as Partial<Shape> }));
  };


  const saveInspirationImages = useCallback(
    async (nextImages: string[]) => {
      setInspirationImages(nextImages);
      await updateProject({
        id: projectId,
        patch: {
          inspirationImages: nextImages,
        },
      });
    },
    [projectId, updateProject]
  );

  const addInspirationImageUrl = useCallback(async () => {
    const trimmed = inspirationImageUrl.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      toast.error("Enter a valid image URL");
      return;
    }

    try {
      setInspirationImageUrl("");
      await saveInspirationImages(Array.from(new Set([...inspirationImages, trimmed])).slice(0, 8));
      toast.success("Inspiration image added");
    } catch (error) {
      console.error(error);
      toast.error("Could not add inspiration image");
    }
  }, [inspirationImageUrl, inspirationImages, saveInspirationImages]);

  const uploadInspirationFiles = useCallback(
    async (files: FileList | File[]) => {
      const images = Array.from(files).filter((file) => file.type.startsWith("image/"));

      if (images.length === 0) {
        toast.error("Drop or choose image files only");
        return;
      }

      setIsUploadingInspiration(true);

      try {
        const uploaded: string[] = [];

        for (const file of images.slice(0, Math.max(0, 8 - inspirationImages.length))) {
          const uploadUrl = await generateUploadUrl();
          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          });

          if (!response.ok) throw new Error(`Upload failed for ${file.name}`);

          const { storageId } = (await response.json()) as { storageId: string };
          uploaded.push(storageId);
        }

        if (uploaded.length === 0) {
          toast.info("Maximum of 8 inspiration images reached");
          return;
        }

        await saveInspirationImages(Array.from(new Set([...inspirationImages, ...uploaded])).slice(0, 8));
        toast.success(`${uploaded.length} inspiration image${uploaded.length === 1 ? "" : "s"} uploaded`);
      } catch (error) {
        console.error(error);
        toast.error("Could not upload inspiration image");
      } finally {
        setIsUploadingInspiration(false);
        setIsDraggingInspiration(false);
        if (inspirationInputRef.current) inspirationInputRef.current.value = "";
      }
    },
    [generateUploadUrl, inspirationImages, saveInspirationImages]
  );

  const onInspirationDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDraggingInspiration(false);
      await uploadInspirationFiles(event.dataTransfer.files);
    },
    [uploadInspirationFiles]
  );

  const removeInspirationImage = useCallback(
    async (image: string) => {
      try {
        await saveInspirationImages(inspirationImages.filter((item) => item !== image));
      } catch (error) {
        console.error(error);
        toast.error("Could not remove inspiration image");
      }
    },
    [inspirationImages, saveInspirationImages]
  );

  const clearAllInspirationImages = useCallback(async () => {
    if (inspirationImages.length === 0) return;

    try {
      setInspirationImages([]);
      await clearInspirationImages({ id: projectId });
      toast.success("Inspiration board cleared");
    } catch (error) {
      console.error(error);
      setInspirationImages(project?.inspirationImages ?? []);
      toast.error("Could not clear inspiration images");
    }
  }, [clearInspirationImages, inspirationImages.length, project?.inspirationImages, projectId]);

  const handleGeneratePreview = useCallback(async () => {
    const targetFrame = selectedFrame ?? shapes.find((shape): shape is Extract<Shape, { type: "frame" }> => shape.type === "frame");

    if (!targetFrame) {
      toast.info("Create or select a frame first");
      dispatch(setTool("frame"));
      return;
    }

    if (generationImageReferences.length > 0 && resolvedGenerationImages === undefined) {
      toast.info("Preparing inspiration images");
      return;
    }

    setIsGeneratingPreview(true);

    const generatedId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `generated-${Date.now()}`;
    const frameShapes = shapesInsideFrame(targetFrame);
    const frameSnapshotImage = await frameSnapshotDataUrl(targetFrame, frameShapes);
    const title = `Frame ${targetFrame.frameNumber} generation`;

    dispatch(
      addGeneratedUI({
        id: generatedId,
        x: targetFrame.x + targetFrame.w + 80,
        y: targetFrame.y,
        w: Math.max(420, targetFrame.w),
        h: Math.max(300, targetFrame.h),
        sourceFrameId: targetFrame.id,
        uiSpecData: JSON.stringify(streamingGeneratedSpec(title, "")),
      })
    );
    dispatch(setTool("select"));
    dispatch(clearSelection());
    dispatch(selectShape(generatedId));

    try {
      recordAiUsage();
      const response = await fetch("/api/generate-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: project?.name,
          prompt: generationPrompt,
          styleGuide: project?.styleGuide,
          moodboardImages: resolvedGenerationImages ?? [],
          frameSnapshotImage,
          frame: targetFrame,
          frameShapes,
          stream: true,
        }),
      });

      if (!response.ok) {
        const spec = (await response.json().catch(() => ({}))) as GeneratedUiResponse & { error?: string };
        throw new Error(spec.error || "Could not generate UI");
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!response.body || !contentType.includes("text/event-stream")) {
        const spec = (await response.json()) as GeneratedUiResponse & { error?: string };
        if (spec.fallback || spec.providerError) {
          throw new Error(spec.providerError || spec.error || "AI provider returned a fallback UI preview");
        }

        const nextSize = await measureGeneratedUiSize(spec, {
          w: Math.max(GENERATED_UI_MIN_WIDTH, targetFrame.w),
          h: Math.max(GENERATED_UI_MIN_HEIGHT, targetFrame.h),
        });
        dispatch(updateShape({ id: generatedId, patch: { uiSpecData: JSON.stringify(spec), ...nextSize } as Partial<Shape>, recordHistory: false }));
        toast.success(`Generated preview from Frame ${targetFrame.frameNumber}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedCode = "";
      let finalSpec: GeneratedUiResponse | null = null;
      let lastPreviewAt = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const parsed = parseServerEvent(block);
          if (!parsed) continue;

          if (parsed.event === "delta" && typeof parsed.data.delta === "string") {
            streamedCode += parsed.data.delta;
            const now = performance.now();
            if (now - lastPreviewAt > 140) {
              lastPreviewAt = now;
              dispatch(
                updateShape({
                  id: generatedId,
                  patch: { uiSpecData: JSON.stringify(streamingGeneratedSpec(title, streamedCode)) } as Partial<Shape>,
                  recordHistory: false,
                })
              );
            }
          }

          if (parsed.event === "done") {
            finalSpec = parsed.data as GeneratedUiResponse;
          }
        }
      }

      if (!finalSpec) finalSpec = streamingGeneratedSpec(title, streamedCode);
      if (finalSpec.fallback || finalSpec.providerError || finalSpec.streaming) {
        throw new Error(finalSpec.providerError || "AI provider did not return a complete generated UI");
      }

      const nextSize = await measureGeneratedUiSize(finalSpec, {
        w: Math.max(GENERATED_UI_MIN_WIDTH, targetFrame.w),
        h: Math.max(GENERATED_UI_MIN_HEIGHT, targetFrame.h),
      });
      dispatch(updateShape({ id: generatedId, patch: { uiSpecData: JSON.stringify(finalSpec), ...nextSize } as Partial<Shape>, recordHistory: false }));
      toast.success(`Generated preview from Frame ${targetFrame.frameNumber}`);
    } catch (error) {
      dispatch(removeShape(generatedId));
      toast.error(readableProviderError(error));
    } finally {
      window.setTimeout(() => setIsGeneratingPreview(false), 250);
    }
  }, [dispatch, generationImageReferences.length, generationPrompt, project?.name, project?.styleGuide, resolvedGenerationImages, selectedFrame, shapes, shapesInsideFrame]);

  const handleCopyGeneratedCode = useCallback(async () => {
    if (!selectedGeneratedUi?.uiSpecData) {
      toast.info("Select a generated UI preview first");
      return;
    }

    await navigator.clipboard.writeText(generatedCodePreview(selectedGeneratedUi.uiSpecData));
    toast.success("Generated HTML and CSS copied");
  }, [selectedGeneratedUi]);

  const handleOpenGeneratedCode = useCallback(() => {
    const documentHtml = generatedHtmlDocument(selectedGeneratedUi?.uiSpecData ?? null);
    if (!documentHtml) {
      toast.info("Select a generated UI preview first");
      return;
    }

    const blob = new Blob([documentHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [selectedGeneratedUi]);

  const handleDownloadGeneratedCode = useCallback(() => {
    const documentHtml = generatedHtmlDocument(selectedGeneratedUi?.uiSpecData ?? null);
    if (!documentHtml) {
      toast.info("Select a generated UI preview first");
      return;
    }

    downloadBlob(new Blob([documentHtml], { type: "text/html" }), exportFilename(project?.name, "generated-ui", "html"));
    toast.success("Generated HTML downloaded");
  }, [project?.name, selectedGeneratedUi]);

  const generateWorkflowPagesFromRender = useCallback(
    async (sourceShape: Extract<Shape, { type: "generatedui" }>, pageTypes: string[], prompt: string) => {
      const currentSpec = generatedSpecFromValue(sourceShape.uiSpecData);
      const currentHTML = currentSpec?.code || currentSpec?.html;

      if (!currentHTML) {
        toast.info("Generate a UI preview before creating workflow pages");
        return;
      }

      if (generationImageReferences.length > 0 && resolvedGenerationImages === undefined) {
        toast.info("Preparing inspiration images");
        return;
      }

      const uniquePageTypes = Array.from(new Set(pageTypes.map((pageType) => pageType.trim()).filter(Boolean))).slice(0, 4);
      if (uniquePageTypes.length === 0) return;

      setIsGeneratingWorkflow(true);
      const createdIds: string[] = [];

      uniquePageTypes.forEach((pageType, index) => {
        const workflowId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `workflow-${Date.now()}-${index}`;
        const title = `${pageType} workflow`;
        createdIds.push(workflowId);

        dispatch(
          addGeneratedUI({
            id: workflowId,
            x: sourceShape.x + (index + 1) * (sourceShape.w + 72),
            y: sourceShape.y,
            w: sourceShape.w,
            h: sourceShape.h,
            sourceFrameId: sourceShape.sourceFrameId,
            isWorkflowPage: true,
            uiSpecData: JSON.stringify(streamingGeneratedSpec(title, "Generating workflow page...")),
          })
        );
      });

      dispatch(clearSelection());
      createdIds.forEach((id) => dispatch(selectShape(id)));
      toast.info(`Generating ${uniquePageTypes.length} workflow page${uniquePageTypes.length === 1 ? "" : "s"}`);

      try {
        let nextX = sourceShape.x + sourceShape.w + 72;
        let successCount = 0;
        let failedCount = 0;

        for (const [index, pageType] of uniquePageTypes.entries()) {
          const workflowId = createdIds[index];
          const title = `${pageType} workflow`;

          try {
            let spec: (GeneratedUiResponse & { error?: string }) | null = null;
            let lastError: unknown = null;

            for (let attempt = 0; attempt < 3; attempt += 1) {
              try {
                const response = await fetch("/api/generate-workflow", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    selectedPageType: pageType,
                    currentHTML,
                    styleGuide: project?.styleGuide,
                    moodboardImages: resolvedGenerationImages ?? [],
                    prompt,
                  }),
                });
                recordAiUsage();

                const candidate = (await response.json().catch(() => ({}))) as GeneratedUiResponse & { error?: string };
                if (!response.ok) throw new Error(candidate.error || "Could not generate workflow page");
                if (candidate.fallback || candidate.providerError) {
                  throw new Error(candidate.providerError || "AI provider returned a fallback workflow page");
                }

                spec = candidate;
                break;
              } catch (error) {
                lastError = error;
                if (attempt < 2 && /503|UNAVAILABLE|high demand|temporar|429|quota|RESOURCE_EXHAUSTED/i.test(String(error))) {
                  await wait(3500 * (attempt + 1));
                  continue;
                }
                throw error;
              }
            }

            if (!spec) throw new Error(readableProviderError(lastError));

            const nextSize = await measureGeneratedUiSize(spec, { w: sourceShape.w, h: sourceShape.h });
            dispatch(
              updateShape({
                id: workflowId,
                patch: { x: nextX, y: sourceShape.y, w: nextSize.w, h: nextSize.h, uiSpecData: JSON.stringify(spec) } as Partial<Shape>,
                recordHistory: false,
              })
            );
            successCount += 1;
            nextX += nextSize.w + 72;
          } catch (error) {
            failedCount += 1;
            dispatch(removeShape(workflowId));
            toast.error(`${title}: ${readableProviderError(error)}`);
          }
        }

        if (successCount > 0) {
          toast.success(`${successCount} workflow page${successCount === 1 ? "" : "s"} generated`);
        }

        if (failedCount > 0 && successCount === 0) {
          toast.info("No workflow pages were added. Retry when Gemini is available.");
        }
      } finally {
        window.setTimeout(() => setIsGeneratingWorkflow(false), 250);
      }
    },
    [dispatch, generationImageReferences.length, project?.styleGuide, resolvedGenerationImages]
  );

  const handleGenerateWorkflow = useCallback(async () => {
    if (!selectedGeneratedUi) {
      toast.info("Select a generated UI preview first");
      return;
    }

    await generateWorkflowPagesFromRender(selectedGeneratedUi, [workflowPageType], workflowPrompt);
  }, [generateWorkflowPagesFromRender, selectedGeneratedUi, workflowPageType, workflowPrompt]);

  const handleGeneratedWorkflow = useCallback(
    async (shape: Extract<Shape, { type: "generatedui" }>) => {
      const currentSpec = generatedSpecFromValue(shape.uiSpecData);
      const currentHTML = currentSpec?.code || currentSpec?.html;
      let pageTypes = DEFAULT_WORKFLOW_PAGE_TYPES;

      if (currentHTML) {
        try {
          recordAiUsage();
          const response = await fetch("/api/plan-workflows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectName: project?.name,
              currentHTML,
              styleGuide: project?.styleGuide,
              prompt: workflowPrompt || currentSpec?.prompt,
            }),
          });

          const plan = (await response.json().catch(() => ({}))) as { pageTypes?: string[] };
          if (response.ok && Array.isArray(plan.pageTypes) && plan.pageTypes.length > 0) {
            pageTypes = plan.pageTypes;
        }
      } catch (error) {
          console.warn("Could not plan workflow pages", error);
        }
      }

      await generateWorkflowPagesFromRender(
        shape,
        pageTypes,
        workflowPrompt ||
          "Generate connected workflow screens that follow from this UI. Use the selected render as the source screen, preserve its style guide, and make each generated page feel like part of the same product."
      );
    },
    [generateWorkflowPagesFromRender, project?.name, project?.styleGuide, workflowPrompt]
  );
  const handleFrameInspiration = useCallback(
    (frame: Extract<Shape, { type: "frame" }>) => {
      toast.info(`Frame ${frame.frameNumber} inspiration slot ready`);
    },
    []
  );

  const startProjectRename = useCallback(() => {
    setProjectNameDraft(project?.name ?? "Untitled project");
    setIsRenamingProject(true);
  }, [project?.name]);

  const cancelProjectRename = useCallback(() => {
    setProjectNameDraft(project?.name ?? "Untitled project");
    setIsRenamingProject(false);
  }, [project?.name]);

  const commitProjectRename = useCallback(async () => {
    const nextName = projectNameDraft.trim();

    if (!nextName) {
      toast.error("Project name cannot be empty");
      return;
    }

    if (nextName === project?.name) {
      setIsRenamingProject(false);
      return;
    }

    setIsProjectRenameSaving(true);
    try {
      await updateProject({
        id: projectId,
        patch: { name: nextName },
      });
      setIsRenamingProject(false);
      toast.success("Project renamed");
    } catch (error) {
      console.error(error);
      toast.error("Could not rename project");
    } finally {
      setIsProjectRenameSaving(false);
    }
  }, [project?.name, projectId, projectNameDraft, updateProject]);
  const handleFrameGenerateDesign = useCallback(
    async (frame: Extract<Shape, { type: "frame" }>, format: "json" | "png") => {
      const frameShapes = shapesInsideFrame(frame);
      const snapshot = {
        kind: "s2c.frame-snapshot",
        version: 1,
        project: {
          id: projectId,
          name: project?.name ?? "Untitled project",
        },
        frame,
        shapes: frameShapes,
        viewport: {
          scale: viewport.scale,
          translate: viewport.translate,
        },
        generatedAt: new Date().toISOString(),
      };

      try {
        if (format === "json") {
          downloadBlob(
            new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }),
            exportFilename(project?.name, `frame-${frame.frameNumber}-snapshot`, "json")
          );
          toast.success(`Frame ${frame.frameNumber} JSON downloaded`);
          return;
        }

        await exportFrameAsPng(frame, frameShapes, exportFilename(project?.name, `frame-${frame.frameNumber}-snapshot`, "png"));
        toast.success(`Frame ${frame.frameNumber} PNG downloaded`);
      } catch (error) {
        console.error(error);
        toast.error(`Could not export frame ${frame.frameNumber}`);
      }
    },
    [project?.name, projectId, shapesInsideFrame, viewport.scale, viewport.translate]
  );

  const handleGeneratedExport = useCallback(
    async (shape: Extract<Shape, { type: "generatedui" }>, format: "json" | "png") => {
      const spec = generatedSpecFromValue(shape.uiSpecData);
      const titleSlug = (spec?.title || (shape.isWorkflowPage ? "workflow-render" : "generated-render"))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 36) || "generated-render";

      try {
        if (format === "json") {
          const snapshot = {
            kind: "s2c.generated-ui-snapshot",
            version: 1,
            project: {
              id: projectId,
              name: project?.name ?? "Untitled project",
            },
            shape: {
              id: shape.id,
              x: shape.x,
              y: shape.y,
              w: shape.w,
              h: shape.h,
              sourceFrameId: shape.sourceFrameId,
              isWorkflowPage: Boolean(shape.isWorkflowPage),
            },
            render: spec,
            generatedAt: new Date().toISOString(),
          };

          downloadBlob(
            new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }),
            exportFilename(project?.name, titleSlug, "json")
          );
          toast.success("Generated render JSON downloaded");
          return;
        }

        downloadBlob(await renderGeneratedUiToPngBlob(shape), exportFilename(project?.name, titleSlug, "png"));
        toast.success("Generated render PNG downloaded");
      } catch (error) {
        console.error(error);
        toast.error(`Could not export generated ${format.toUpperCase()}`);
      }
    },
    [project?.name, projectId]
  );


  if (project === undefined) {
    return <div className="grid min-h-svh place-items-center bg-background text-muted-foreground">Loading workspace</div>;
  }

  if (project === null) {
    return <div className="grid min-h-svh place-items-center bg-background text-foreground">Project not found</div>;
  }

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="size-9 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <Link href="/dashboard" aria-label="Back to dashboard">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            {isRenamingProject ? (
              <div className="flex min-w-0 items-center gap-1.5">
                <Input
                  className="h-8 w-64 max-w-[42vw] rounded-md border-border bg-background px-2 text-sm font-semibold"
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void commitProjectRename();
                    if (event.key === "Escape") cancelProjectRename();
                  }}
                  autoFocus
                  disabled={isProjectRenameSaving}
                  aria-label="Project name"
                />
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  onClick={() => void commitProjectRename()}
                  disabled={isProjectRenameSaving}
                  aria-label="Save project name"
                >
                  <Check className="size-4" />
                </button>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={cancelProjectRename}
                  aria-label="Cancel project rename"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="group flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-muted/70"
                onClick={startProjectRename}
                title="Rename project"
              >
                <h1 className="truncate text-sm font-semibold leading-none">{project.name}</h1>
                <Edit3 className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
              </button>
            )}
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {saveStatus === "saving" ? "Autosaving..." : saveStatus === "saved" ? "Autosaved" : saveStatus === "error" ? "Autosave failed" : "FramePilot / Editor"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-9 items-center gap-1 rounded-md border border-border bg-muted px-1 text-sm text-muted-foreground">
            <button type="button" className="grid size-7 place-items-center rounded-md hover:bg-background hover:text-foreground disabled:opacity-40" disabled={shapesState.past.length === 0} onClick={() => dispatch(undo())} title="Undo" suppressHydrationWarning>
              <Undo2 className="size-4" />
            </button>
            <button type="button" className="grid size-7 place-items-center rounded-md hover:bg-background hover:text-foreground disabled:opacity-40" disabled={shapesState.future.length === 0} onClick={() => dispatch(redo())} title="Redo" suppressHydrationWarning>
              <Redo2 className="size-4" />
            </button>
          </div>
          <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
            <ZoomOut className="size-4 cursor-pointer" onClick={() => dispatch(setScale({ scale: viewport.scale / 1.15, originScreen: canvasCenterScreen() }))} />
            <button type="button" className="w-12 text-center" onClick={() => dispatch(resetView())} suppressHydrationWarning>
              {Math.round(viewport.scale * 100)}%
            </button>
            <ZoomIn className="size-4 cursor-pointer" onClick={() => dispatch(setScale({ scale: viewport.scale * 1.15, originScreen: canvasCenterScreen() }))} />
          </div>
          <Button asChild variant="outline" className="h-9 rounded-md px-3">
            <Link href={`/dashboard/projects/${projectId}/style-guide`}>
              <SwatchBook className="size-4" />
              Style guide
            </Link>
          </Button>
          <Button onClick={onSave} disabled={isSaving} className="h-9 rounded-md px-4">
            <Save className="size-4" />
            {isSaving ? "Saving" : "Save"}
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "grid min-h-0 flex-1 transition-[grid-template-columns] duration-200 ease-out",
          inspectorOpen ? "grid-cols-[56px_minmax(0,1fr)_280px]" : "grid-cols-[56px_minmax(0,1fr)_56px]"
        )}
      >
        <aside className="flex flex-col items-center rounded-tr-lg border-r border-border bg-muted/35 py-3">
          <div className="grid gap-2">
            {tools.map((tool, index) => {
              const Icon = tool.icon;
              const active = shapesState.tool === tool.id;

              return (
                <button
                  key={tool.id}
                  type="button"
                  title={tool.label}
                  suppressHydrationWarning
                  onClick={() => dispatch(setTool(tool.id))}
                  className={cn(
                    "grid size-10 place-items-center rounded-md border border-transparent text-muted-foreground transition hover:bg-muted hover:text-foreground",
                    active && "border-primary/50 bg-primary/10 text-primary"
                  )}
                >
                  <Icon className="size-5" />
                  {index === 1 || index === 5 ? <span className="mt-3 h-px w-8 bg-border" /> : null}
                </button>
              );
            })}
          </div>
          <div className="mt-auto grid gap-2">
            <button className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Layers" suppressHydrationWarning>
              <Layers3 className="size-5" />
            </button>
          </div>
        </aside>

        <InfiniteCanvasRenderer
          viewportRef={viewportRef}
          viewport={viewport}
          spacePressed={spacePressed}
          draft={draft}
          shapes={shapes}
          selected={shapesState.selected}
          tool={shapesState.tool}
          getShapeBounds={getShapeBounds}
          renderShape={renderShape}
          onPointerDown={infiniteCanvas.onCanvasPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointerOperation}
          onPointerLeave={cancelPointerOperation}
          onWheel={infiniteCanvas.onWheel}
          onShapePointerDown={startShapeDrag}
          onResizePointerDown={startResize}
          onFrameInspiration={handleFrameInspiration}
          onFrameGenerateDesign={handleFrameGenerateDesign}
          onGeneratedExport={handleGeneratedExport}
          onGeneratedWorkflow={handleGeneratedWorkflow}
        />

        <aside
          className={cn(
            "min-h-0 rounded-tl-lg border-l border-border bg-card transition-colors",
            inspectorOpen ? "grid grid-rows-[auto_minmax(0,1fr)_auto]" : "flex flex-col items-center py-3"
          )}
          onMouseEnter={() => setInspectorActive(true)}
          onMouseLeave={() => setInspectorActive(false)}
          onFocus={() => setInspectorActive(true)}
          onBlur={() => setInspectorActive(false)}
        >
          {inspectorOpen ? (
            <>

          <section className="max-h-[42svh] overflow-y-auto border-b border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Properties</p>
              <div className="flex items-center gap-2">
                <span className="text-xs capitalize text-muted-foreground">{selectedShape ? selectedShape.type : "None"}</span>
                <button
                  type="button"
                  className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setInspectorOpen(false)}
                  aria-label="Collapse inspector"
                >
                  <PanelRightClose className="size-4" />
                </button>
              </div>
            </div>

            {selectedShape && selectedBounds ? (
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <label className="space-y-1.5 text-muted-foreground">
                  X
                  <Input className="h-8 text-right" type="number" value={Math.round(selectedBounds.x)} onChange={(event) => updateSelectedBounds({ x: Number(event.target.value) })} />
                </label>
                <label className="space-y-1.5 text-muted-foreground">
                  Y
                  <Input className="h-8 text-right" type="number" value={Math.round(selectedBounds.y)} onChange={(event) => updateSelectedBounds({ y: Number(event.target.value) })} />
                </label>
                <label className="space-y-1.5 text-muted-foreground">
                  Width
                  <Input className="h-8 text-right" type="number" value={Math.round(selectedBounds.w)} onChange={(event) => updateSelectedBounds({ w: Number(event.target.value) })} />
                </label>
                <label className="space-y-1.5 text-muted-foreground">
                  Height
                  <Input className="h-8 text-right" type="number" value={Math.round(selectedBounds.h)} onChange={(event) => updateSelectedBounds({ h: Number(event.target.value) })} />
                </label>
                {selectedShape.type === "text" && (
                  <div className="col-span-2 space-y-3 rounded-md border border-border bg-background/60 p-3">
                    <label className="space-y-1.5 text-muted-foreground">
                      Text
                      <Textarea
                        className="min-h-20 resize-y text-foreground"
                        value={selectedShape.text}
                        onChange={(event) => updateSelectedText(event.target.value)}
                      />
                    </label>

                    <label className="space-y-1.5 text-muted-foreground">
                      Font
                      <select
                        className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none"
                        value={selectedShape.fontFamily}
                        onChange={(event) => updateSelectedTextStyle({ fontFamily: event.target.value })}
                      >
                        <option value="Inter, sans-serif">Inter</option>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="Times New Roman, serif">Times New Roman</option>
                        <option value="Courier New, monospace">Courier New</option>
                        <option value="Verdana, sans-serif">Verdana</option>
                        <option value="Trebuchet MS, sans-serif">Trebuchet MS</option>
                        <option value="Impact, sans-serif">Impact</option>
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1.5 text-muted-foreground">
                        Size
                        <Input
                          className="h-8 text-right"
                          type="number"
                          min={8}
                          max={160}
                          value={selectedShape.fontSize}
                          onChange={(event) => updateSelectedTextStyle({ fontSize: Number(event.target.value) })}
                        />
                      </label>
                      <label className="space-y-1.5 text-muted-foreground">
                        Line
                        <Input
                          className="h-8 text-right"
                          type="number"
                          min={0.8}
                          max={3}
                          step={0.1}
                          value={selectedShape.lineHeight}
                          onChange={(event) => updateSelectedTextStyle({ lineHeight: Number(event.target.value) })}
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <Button
                        type="button"
                        variant={selectedShape.fontWeight >= 700 ? "default" : "outline"}
                        size="icon-sm"
                        onClick={() => updateSelectedTextStyle({ fontWeight: selectedShape.fontWeight >= 700 ? 400 : 700 })}
                        aria-label="Bold"
                      >
                        <Bold className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={selectedShape.fontStyle === "italic" ? "default" : "outline"}
                        size="icon-sm"
                        onClick={() => updateSelectedTextStyle({ fontStyle: selectedShape.fontStyle === "italic" ? "normal" : "italic" })}
                        aria-label="Italic"
                      >
                        <Italic className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={selectedShape.textDecoration === "underline" ? "default" : "outline"}
                        size="icon-sm"
                        onClick={() => updateSelectedTextStyle({ textDecoration: selectedShape.textDecoration === "underline" ? "none" : "underline" })}
                        aria-label="Underline"
                      >
                        <Underline className="size-4" />
                      </Button>
                      <Input
                        className="h-7 px-1"
                        type="color"
                        value={String(selectedShape.fill ?? "#ffffff")}
                        onChange={(event) => updateSelectedTextStyle({ fill: event.target.value })}
                        aria-label="Text color"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1.5 text-muted-foreground">
                        Spacing
                        <Input
                          className="h-8 text-right"
                          type="number"
                          step={0.1}
                          value={selectedShape.letterSpacing}
                          onChange={(event) => updateSelectedTextStyle({ letterSpacing: Number(event.target.value) })}
                        />
                      </label>
                      <label className="space-y-1.5 text-muted-foreground">
                        Case
                        <select
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none"
                          value={selectedShape.textTransform}
                          onChange={(event) =>
                            updateSelectedTextStyle({
                              textTransform: event.target.value as Extract<Shape, { type: "text" }>["textTransform"],
                            })
                          }
                        >
                          <option value="none">None</option>
                          <option value="uppercase">Upper</option>
                          <option value="lowercase">Lower</option>
                          <option value="capitalize">Title</option>
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        variant={selectedShape.textAlign === "left" ? "default" : "outline"}
                        size="icon-sm"
                        onClick={() => updateSelectedTextStyle({ textAlign: "left" })}
                        aria-label="Align left"
                      >
                        <AlignLeft className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={selectedShape.textAlign === "center" ? "default" : "outline"}
                        size="icon-sm"
                        onClick={() => updateSelectedTextStyle({ textAlign: "center" })}
                        aria-label="Align center"
                      >
                        <AlignCenter className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={selectedShape.textAlign === "right" ? "default" : "outline"}
                        size="icon-sm"
                        onClick={() => updateSelectedTextStyle({ textAlign: "right" })}
                        aria-label="Align right"
                      >
                        <AlignRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="col-span-2 mt-1 h-8">
                      <Trash2 className="size-4" />
                      Delete selection
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete selected layer?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes the selected frame, shape, text, or generated screen from the canvas.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => dispatch(removeShape(selectedShape.id))}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-5 text-muted-foreground">Select a shape to edit position, size, or text.</p>
            )}
          </section>

          <div className="grid min-h-0 grid-rows-[minmax(120px,0.95fr)_minmax(220px,1.05fr)] overflow-hidden">
            <section className="min-h-0 overflow-y-auto border-b border-border p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Layers</p>
              <span className="text-xs text-muted-foreground">{shapes.length}</span>
            </div>
            <div className="space-y-1.5">
              {[...shapes].reverse().map((shape) => {
                const active = Boolean(shapesState.selected[shape.id]);

                return (
                  <button
                    key={shape.id}
                    type="button"
                    className={cn(
                      "flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                      active && "bg-primary/10 text-primary"
                    )}
                    onClick={() => {
                      dispatch(setTool("select"));
                      dispatch(clearSelection());
                      dispatch(selectShape(shape.id));
                    }}
                    suppressHydrationWarning
                  >
                    <span className="truncate">{shapeLabel(shape)}</span>
                    <span className="capitalize opacity-60">{shape.type}</span>
                  </button>
                );
              })}
              {shapes.length === 0 && <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">Use the tools on the left to create your first frame or shape.</p>}
            </div>
          </section>

          <section className="min-h-0 overflow-y-auto border-b border-border p-3">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">AI Generation</p>
              <Sparkles className="size-4 text-primary" />
            </div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Inspiration Board</p>
              {inspirationImages.length > 0 ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      suppressHydrationWarning
                    >
                      Clear all
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear inspiration board?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes all inspiration images from the current project generation panel.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => void clearAllInspirationImages()}
                      >
                        Clear images
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
            <input
              ref={inspirationInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => event.target.files && void uploadInspirationFiles(event.target.files)}
            />
            <div
              className={cn(
                "rounded-md border border-dashed p-2 transition",
                isDraggingInspiration ? "border-primary bg-primary/10" : "border-border bg-muted/30"
              )}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingInspiration(true);
              }}
              onDragLeave={() => setIsDraggingInspiration(false)}
              onDrop={(event) => void onInspirationDrop(event)}
            >
              {inspirationImages.length === 0 ? (
                <button
                  type="button"
                  className="grid min-h-28 w-full place-items-center rounded-md text-center text-xs text-muted-foreground hover:bg-muted/60"
                  onClick={() => inspirationInputRef.current?.click()}
                  disabled={isUploadingInspiration}
                  suppressHydrationWarning
                >
                  <span>
                    <ImagePlus className="mx-auto mb-2 size-5" />
                    {isUploadingInspiration ? "Uploading images" : "Drop images here or browse"}
                    <span className="mt-1 block text-[10px]">Up to 8 images used by AI</span>
                  </span>
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="grid aspect-square place-items-center rounded-md border border-dashed border-border text-center text-xs text-muted-foreground hover:bg-muted/60"
                    onClick={() => inspirationInputRef.current?.click()}
                    disabled={isUploadingInspiration || inspirationImages.length >= 8}
                    suppressHydrationWarning
                  >
                    <span>
                      <ImagePlus className="mx-auto mb-2 size-4" />
                      {isUploadingInspiration ? "Uploading" : "Add"}
                    </span>
                  </button>
                  {inspirationImages.map((image) => (
                    <div key={image} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
                      <MoodBoardImage value={image} />
                      <button
                        type="button"
                        className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-background/85 text-muted-foreground opacity-0 shadow-sm transition hover:text-foreground group-hover:opacity-100"
                        onClick={() => void removeInspirationImage(image)}
                        aria-label="Remove inspiration image"
                        suppressHydrationWarning
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                className="h-8 text-xs"
                value={inspirationImageUrl}
                onChange={(event) => setInspirationImageUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addInspirationImageUrl();
                  }
                }}
                placeholder="Paste image URL"
              />
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => void addInspirationImageUrl()}
                disabled={!inspirationImageUrl.trim() || inspirationImages.length >= 8}
                title="Add image URL"
              >
                <ImagePlus className="size-4" />
              </Button>
            </div>
            <label className="mt-4 block space-y-2 text-xs text-muted-foreground">
              Prompt Input
              <Textarea
                className="min-h-16 resize-y"
                placeholder="Describe the desired aesthetic, component style, and color palette..."
                value={generationPrompt}
                onChange={(event) => setGenerationPrompt(event.target.value)}
                suppressHydrationWarning
              />
            </label>
            <Button className="mt-4 h-10 w-full rounded-md" onClick={handleGeneratePreview} disabled={isGeneratingPreview}>
              <Sparkles className="size-4" />
              {isGeneratingPreview ? "Generating" : "Generate Modern UI"}
            </Button>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Select a frame first. The generated preview uses the style guide plus {resolvedGenerationImages?.length ?? 0} resolved inspiration image{(resolvedGenerationImages?.length ?? 0) === 1 ? "" : "s"}.</p>
          </section>

          <section className="border-t border-border p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workflow AI</p>
              <Sparkles className="size-4 text-muted-foreground" />
            </div>
            <label className="block space-y-2 text-xs text-muted-foreground">
              Page type
              <select
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none"
                value={workflowPageType}
                onChange={(event) => setWorkflowPageType(event.target.value)}
                suppressHydrationWarning
              >
                <option value="Checkout">Checkout</option>
                <option value="Onboarding">Onboarding</option>
                <option value="Settings">Settings</option>
                <option value="Dashboard">Dashboard</option>
                <option value="Details">Details</option>
                <option value="Success">Success</option>
              </select>
            </label>
            <label className="mt-3 block space-y-2 text-xs text-muted-foreground">
              Workflow prompt
              <Textarea
                className="min-h-16 resize-y rounded-md text-sm"
                placeholder="Describe the next screen this UI should lead to..."
                value={workflowPrompt}
                onChange={(event) => setWorkflowPrompt(event.target.value)}
                suppressHydrationWarning
              />
            </label>
            <Button
              variant="outline"
              className="mt-4 h-10 w-full rounded-md"
              onClick={handleGenerateWorkflow}
              disabled={isGeneratingWorkflow || !selectedGeneratedUi}
            >
              <Sparkles className="size-4" />
              {isGeneratingWorkflow ? "Generating workflow" : "Generate workflow page"}
            </Button>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Select a generated UI preview first. The workflow page will match its HTML, style guide, and inspiration board.
            </p>
          </section>

          </div>

          <section className="border-t border-border p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Code Export</p>
              <Code2 className="size-4 text-muted-foreground" />
            </div>
            <div className="rounded-md border border-border bg-background text-xs leading-5 text-muted-foreground">
              <div className="border-b border-border px-3 py-2 text-primary">Tailwind + React</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5">
                {generatedCodePreview(selectedGeneratedUi?.uiSpecData ?? null)}
              </pre>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button variant="outline" className="h-9 shrink-0 rounded-md" onClick={handleCopyGeneratedCode} disabled={!selectedGeneratedUi} title="Copy generated HTML and CSS">
                <Copy className="size-4" />
              </Button>
              <Button variant="outline" className="h-9 shrink-0 rounded-md" onClick={handleOpenGeneratedCode} disabled={!selectedGeneratedUi} title="Open generated UI preview">
                <ExternalLink className="size-4" />
              </Button>
              <Button variant="outline" className="h-9 shrink-0 rounded-md" onClick={handleDownloadGeneratedCode} disabled={!selectedGeneratedUi} title="Download generated HTML">
                <Download className="size-4" />
              </Button>
            </div>
          </section>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center gap-2">
              <button
                type="button"
                className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setInspectorOpen(true)}
                aria-label="Open inspector"
                title="Open inspector"
              >
                <PanelRightOpen className="size-5" />
              </button>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setInspectorOpen(true)}
                aria-label="Open layers"
                title="Layers"
              >
                <Layers3 className="size-5" />
              </button>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setInspectorOpen(true)}
                aria-label="Open AI generation"
                title="AI generation"
              >
                <Sparkles className="size-5" />
              </button>
              <button
                type="button"
                className="mt-auto grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setInspectorOpen(true)}
                aria-label="Open code export"
                title="Code export"
              >
                <Code2 className="size-5" />
              </button>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
