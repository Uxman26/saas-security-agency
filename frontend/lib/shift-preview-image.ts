/**
 * Draws the Shift preview (as the rota's preview dialog shows it) onto a canvas and
 * returns a PNG, so it can be sent to staff on WhatsApp in place of a text list.
 *
 * Drawn by hand rather than screenshotted from the DOM: the theme colours are CSS
 * variables and color-mix() values that DOM-to-image tools mis-render, and the image
 * should look the same (light theme) whatever theme the sender is using.
 */

export type ShiftImagePeriod = 'morning' | 'afternoon' | 'evening' | 'night';

export type ShiftImageRow = {
  weekday: string;
  day: string;
  month: string;
  time: string;
  hours: string;
  dotColor?: string | null;
  period: ShiftImagePeriod;
  site: string;
  note?: string;
  address?: string;
};

export type ShiftImageData = {
  employeeName: string;
  rotaName?: string;
  totalHours: string;
  totalShifts: number;
  totalSites: number;
  week: string;
  rows: ShiftImageRow[];
};

// Light-theme values from globals.css (the shift-type fills are its color-mix() results).
const C = {
  primary: '#F45100',
  headerDark: '#0F172A',
  fg: '#172033',
  muted: '#475569',
  border: '#E2E8F0',
  stripe: '#F8FAFC',
  tileBg: '#F1F5F9',
  card: '#FFFFFF',
};

const PERIOD: Record<ShiftImagePeriod, { label: string; bg: string; fg: string }> = {
  morning: { label: 'MORNING SHIFT', bg: '#C8ECFE', fg: '#0C4A6E' },
  afternoon: { label: 'AFTERNOON SHIFT', bg: '#EBD2A0', fg: '#422006' },
  evening: { label: 'EVENING SHIFT', bg: '#EFE0FF', fg: '#4C1D95' },
  night: { label: 'NIGHT SHIFT', bg: '#0B0F14', fg: '#F8FAFC' },
};

const WIDTH = 960;
const PAD = 28;
const SCALE = 2;

// Table columns: x offset from the table's left edge and width.
const COLS = {
  date: { x: 0, w: 76 },
  time: { x: 76, w: 150 },
  type: { x: 226, w: 160 },
  site: { x: 386, w: 190 },
  address: { x: 576, w: 230 },
  hours: { x: 806, w: 98 },
};

function fontStack(): string {
  if (typeof document === 'undefined') return 'system-ui, sans-serif';
  const f = getComputedStyle(document.body).fontFamily;
  return f || 'system-ui, sans-serif';
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 4): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A colour the canvas accepts, or the fallback (CSS variables cannot be drawn). */
function safeColor(ctx: CanvasRenderingContext2D, color: string | null | undefined, fallback: string): string {
  if (!color || color.includes('var(')) return fallback;
  const before = ctx.fillStyle;
  ctx.fillStyle = '#000001';
  ctx.fillStyle = color;
  const ok = ctx.fillStyle !== '#000001';
  ctx.fillStyle = before;
  return ok ? color : fallback;
}

export function renderShiftPreviewPng(data: ShiftImageData): Promise<Blob> {
  const font = fontStack();
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return Promise.reject(new Error('Canvas not supported'));
  const f = (weight: number, size: number, italic = false) => `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;

  // Lay out each row first so the canvas can be sized to fit.
  const tableW = WIDTH - PAD * 2;
  const rowLayouts = data.rows.map((r) => {
    measure.font = f(700, 14);
    const site = wrap(measure, r.site || '—', COLS.site.w - 34, 3);
    measure.font = f(400, 12, true);
    const note = r.note ? wrap(measure, r.note, COLS.site.w - 34, 2) : [];
    measure.font = f(400, 13);
    const address = r.address ? wrap(measure, r.address, COLS.address.w - 34, 4) : [];
    const siteH = site.length * 18 + note.length * 16;
    const addrH = address.length * 17;
    const h = Math.max(72, 24 + Math.max(siteH, addrH));
    return { site, note, address, h };
  });

  const headerH = 92;
  const tilesH = 70;
  const theadH = 38;
  const emptyH = 80;
  const bodyH = data.rows.length ? rowLayouts.reduce((s, l) => s + l.h, 0) : emptyH;
  const footerH = data.rows.length ? 70 : 0;
  const height = headerH + 20 + tilesH + 20 + theadH + bodyH + (footerH ? 20 + footerH : 0) + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas not supported'));
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';

  // Background
  ctx.fillStyle = C.card;
  ctx.fillRect(0, 0, WIDTH, height);

  // Header: avatar circle, name, rota/week line.
  ctx.fillStyle = C.headerDark;
  ctx.fillRect(0, 0, WIDTH, headerH);
  ctx.fillStyle = C.primary;
  ctx.fillRect(0, headerH - 4, WIDTH, 4);
  const initials = data.employeeName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  ctx.fillStyle = C.primary;
  ctx.beginPath();
  ctx.arc(PAD + 24, headerH / 2 - 2, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = f(700, 17);
  ctx.textAlign = 'center';
  ctx.fillText(initials || '•', PAD + 24, headerH / 2 + 4);
  ctx.textAlign = 'left';
  ctx.font = f(800, 22);
  ctx.fillText(data.employeeName.toUpperCase(), PAD + 62, 42, WIDTH - PAD * 2 - 62);
  ctx.fillStyle = '#CBD5E1';
  ctx.font = f(500, 13);
  ctx.fillText(
    [data.rotaName ? `Shift preview · ${data.rotaName}` : 'Shift preview', data.week].filter(Boolean).join('  ·  '),
    PAD + 62,
    64,
    WIDTH - PAD * 2 - 62
  );

  // Summary tiles
  let y = headerH + 20;
  const tiles: [string, string][] = [
    ['TOTAL HOURS', data.totalHours],
    ['TOTAL SHIFTS', String(data.totalShifts)],
    ['TOTAL SITES', String(data.totalSites)],
    ['WEEK', data.week],
  ];
  const tileW = tableW / tiles.length;
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  roundRect(ctx, PAD, y, tableW, tilesH, 10);
  ctx.stroke();
  tiles.forEach(([label, value], i) => {
    const x = PAD + i * tileW;
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y + 12);
      ctx.lineTo(x + 0.5, y + tilesH - 12);
      ctx.stroke();
    }
    ctx.fillStyle = C.primary;
    ctx.fillRect(x + 16, y + 20, 4, 30);
    ctx.fillStyle = C.muted;
    ctx.font = f(700, 10);
    ctx.fillText(label, x + 30, y + 30);
    ctx.fillStyle = C.fg;
    let size = 16;
    ctx.font = f(800, size);
    while (size > 11 && ctx.measureText(value).width > tileW - 40) {
      size -= 1;
      ctx.font = f(800, size);
    }
    ctx.fillText(value, x + 30, y + 52, tileW - 40);
  });

  // Table header
  y += tilesH + 20;
  const tx = PAD;
  ctx.save();
  roundRect(ctx, tx, y, tableW, theadH + bodyH, 10);
  ctx.clip();
  ctx.fillStyle = C.headerDark;
  ctx.fillRect(tx, y, tableW, theadH);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = f(700, 10);
  const heads: [keyof typeof COLS, string][] = [
    ['date', 'DATE'],
    ['time', 'SHIFT TIME'],
    ['type', 'SHIFT TYPE'],
    ['site', 'SITE'],
    ['address', 'SITE ADDRESS'],
    ['hours', 'HOURS'],
  ];
  for (const [k, label] of heads) {
    const col = COLS[k];
    if (k === 'hours') {
      ctx.textAlign = 'right';
      ctx.fillText(label, tx + col.x + col.w - 14, y + 24);
      ctx.textAlign = 'left';
    } else if (k === 'date') {
      ctx.textAlign = 'center';
      ctx.fillText(label, tx + col.x + col.w / 2, y + 24);
      ctx.textAlign = 'left';
    } else {
      ctx.fillText(label, tx + col.x + 12, y + 24);
    }
  }
  y += theadH;

  if (!data.rows.length) {
    ctx.fillStyle = C.muted;
    ctx.font = f(500, 14);
    ctx.textAlign = 'center';
    ctx.fillText('No shifts scheduled for this employee.', WIDTH / 2, y + emptyH / 2 + 5);
    ctx.textAlign = 'left';
  }

  data.rows.forEach((r, i) => {
    const L = rowLayouts[i];
    if (i % 2 === 1) {
      ctx.fillStyle = C.stripe;
      ctx.fillRect(tx, y, tableW, L.h);
    }
    ctx.strokeStyle = C.border;
    ctx.beginPath();
    ctx.moveTo(tx, y + 0.5);
    ctx.lineTo(tx + tableW, y + 0.5);
    ctx.stroke();

    // Date (stacked)
    const dc = tx + COLS.date.x + COLS.date.w / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.muted;
    ctx.font = f(700, 10);
    ctx.fillText(r.weekday.toUpperCase(), dc, y + 22);
    ctx.fillStyle = C.fg;
    ctx.font = f(800, 22);
    ctx.fillText(r.day, dc, y + 46);
    ctx.fillStyle = C.muted;
    ctx.font = f(700, 10);
    ctx.fillText(r.month.toUpperCase(), dc, y + 60);
    ctx.textAlign = 'left';

    // Time + hours
    const tcx = tx + COLS.time.x + 12;
    ctx.fillStyle = safeColor(ctx, r.dotColor, PERIOD.night.bg);
    ctx.beginPath();
    ctx.arc(tcx + 5, y + 25, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.fg;
    ctx.font = f(700, 14);
    ctx.fillText(r.time, tcx + 16, y + 30, COLS.time.w - 30);
    ctx.fillStyle = C.muted;
    ctx.font = f(500, 12);
    ctx.fillText(r.hours, tcx + 16, y + 50);

    // Shift type pill
    const p = PERIOD[r.period];
    ctx.font = f(800, 10);
    const pw = ctx.measureText(p.label).width + 22;
    const px = tx + COLS.type.x + 12;
    ctx.fillStyle = p.bg;
    roundRect(ctx, px, y + 14, pw, 26, 5);
    ctx.fill();
    ctx.fillStyle = p.fg;
    ctx.fillText(p.label, px + 11, y + 31);

    // Site + note
    const sx = tx + COLS.site.x + 12;
    ctx.fillStyle = C.muted;
    ctx.fillRect(sx, y + 17, 12, 14);
    ctx.fillStyle = C.card;
    ctx.fillRect(sx + 3, y + 20, 2, 2);
    ctx.fillRect(sx + 7, y + 20, 2, 2);
    ctx.fillRect(sx + 3, y + 25, 2, 2);
    ctx.fillRect(sx + 7, y + 25, 2, 2);
    let ly = y + 29;
    ctx.fillStyle = C.fg;
    ctx.font = f(700, 14);
    for (const line of L.site) {
      ctx.fillText(line, sx + 22, ly);
      ly += 18;
    }
    ctx.fillStyle = C.muted;
    ctx.font = f(400, 12, true);
    for (const line of L.note) {
      ctx.fillText(line, sx + 22, ly);
      ly += 16;
    }

    // Address
    const ax = tx + COLS.address.x + 12;
    if (L.address.length) {
      ctx.fillStyle = C.primary;
      ctx.beginPath();
      ctx.arc(ax + 6, y + 21, 5.5, Math.PI, 0);
      ctx.lineTo(ax + 6, y + 32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.card;
      ctx.beginPath();
      ctx.arc(ax + 6, y + 21, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.fg;
      ctx.font = f(400, 13);
      let ay = y + 29;
      for (const line of L.address) {
        ctx.fillText(line, ax + 20, ay);
        ay += 17;
      }
    } else {
      ctx.fillStyle = C.muted;
      ctx.font = f(400, 13);
      ctx.fillText('—', ax, y + 29);
    }

    // Hours
    ctx.fillStyle = C.fg;
    ctx.font = f(800, 14);
    ctx.textAlign = 'right';
    ctx.fillText(r.hours, tx + COLS.hours.x + COLS.hours.w - 14, y + 30);
    ctx.textAlign = 'left';

    y += L.h;
  });
  ctx.restore();

  // Table outline
  ctx.strokeStyle = C.border;
  roundRect(ctx, tx + 0.5, y - bodyH - theadH + 0.5, tableW - 1, theadH + bodyH - 1, 10);
  ctx.stroke();

  // Totals footer
  if (footerH) {
    y += 20;
    ctx.fillStyle = C.tileBg;
    roundRect(ctx, PAD, y, tableW, footerH, 10);
    ctx.fill();
    const half = tableW / 2;
    const totals: [string, string][] = [
      ['TOTAL HOURS', data.totalHours],
      ['TOTAL SHIFTS', String(data.totalShifts)],
    ];
    totals.forEach(([label, value], i) => {
      const x = PAD + i * half;
      if (i > 0) {
        ctx.strokeStyle = C.border;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, y + 12);
        ctx.lineTo(x + 0.5, y + footerH - 12);
        ctx.stroke();
      }
      ctx.fillStyle = C.muted;
      ctx.font = f(700, 10);
      ctx.fillText(label, x + 20, y + 28);
      ctx.fillStyle = C.fg;
      ctx.font = f(800, 20);
      ctx.fillText(value, x + 20, y + 54);
    });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png');
  });
}

/** True on phones and tablets, where the share sheet can hand an image straight to WhatsApp. */
export function canShareImageNatively(file: File): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  try {
    return Boolean(touch) && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
