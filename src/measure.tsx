import type { Furniture, Layout, Project, WallName } from './model'
import { WALL_NAMES } from './model'
import { corners, exterior, interior, isCircular, isSolid, overlaps, wallFrame, wallPoint, type Point } from './geometry'

/** Shared measurement system: computes annotations from the actual room and
 *  furniture geometry (cm), and renders them as SVG. Used by the live 2D
 *  editor and by the PNG export, so both always show identical numbers. */
export type MeasureMode = 'off' | 'selected' | 'all'
export type MeasureInclude = { room: boolean; furniture: boolean; walls: boolean; pairs: boolean; openings: boolean; outdoor: boolean }
export type MeasureOptions = { mode: MeasureMode; selectedId?: string | null; include: MeasureInclude; detail: 'basic' | 'detailed'; /** plan units per screen px */ k: number; compact?: boolean }
export type DimKind = 'wall' | 'pair' | 'size' | 'room' | 'opening' | 'outdoor' | 'overlap'
export type Dim = { kind: DimKind; x1: number; y1: number; x2: number; y2: number; label: string; accent?: boolean; warn?: boolean; priority: number; /** draw as a plain label at (x1,y1) */ textOnly?: boolean }

export const ALL_INCLUDE: MeasureInclude = { room: true, furniture: true, walls: true, pairs: true, openings: true, outdoor: true }
export const BASIC_INCLUDE: MeasureInclude = { room: true, furniture: true, walls: false, pairs: false, openings: true, outdoor: false }
const fmt = (v: number) => `${Math.round(v)} cm`

/** An entity is one movable thing: a single item, or a grouped modular sofa (several footprints). */
type Entity = { id: string; ids: string[]; name: string; items: Furniture[]; polys: Point[][]; solid: boolean }
function footprint(f: Furniture): Point[] {
  if (!isCircular(f)) return corners(f)
  const r = Math.min(f.width, f.depth) / 2
  return Array.from({ length: 20 }, (_, i) => ({ x: f.x + Math.cos(i / 20 * Math.PI * 2) * r, y: f.y + Math.sin(i / 20 * Math.PI * 2) * r }))
}
function entities(furniture: Furniture[]): Entity[] {
  const out: Entity[] = [], seen = new Set<string>()
  for (const f of furniture) {
    if (seen.has(f.id) || f.mount === 'wall') continue
    const members = f.groupId && f.grouped ? furniture.filter(o => o.groupId === f.groupId && o.grouped) : [f]
    members.forEach(m => seen.add(m.id))
    out.push({ id: f.id, ids: members.map(m => m.id), name: members.length > 1 ? 'Sofa' : f.name, items: members, polys: members.map(footprint), solid: isSolid(f) })
  }
  return out
}
const axisAligned = (f: Furniture) => isCircular(f) || Math.abs(((f.rotation % 90) + 90) % 90) < .5 || Math.abs(((f.rotation % 90) + 90) % 90 - 90) < .5
function segPoint(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0
  return { x: a.x + dx * t, y: a.y + dy * t }
}
/** Shortest gap between two footprints. Axis-aligned neighbours get a straight
 *  horizontal/vertical clearance line anchored on their facing edges. */
function polyClearance(a: Point[], b: Point[], fa: Furniture, fb: Furniture): { d: number; p: Point; q: Point } {
  const bb = (P: Point[]) => ({ minX: Math.min(...P.map(p => p.x)), maxX: Math.max(...P.map(p => p.x)), minY: Math.min(...P.map(p => p.y)), maxY: Math.max(...P.map(p => p.y)) })
  if (axisAligned(fa) && axisAligned(fb) && !isCircular(fa) && !isCircular(fb)) {
    const A = bb(a), B = bb(b)
    const yo = Math.min(A.maxY, B.maxY) - Math.max(A.minY, B.minY), xo = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX)
    if (yo > 0) { const y = (Math.max(A.minY, B.minY) + Math.min(A.maxY, B.maxY)) / 2; return A.maxX <= B.minX ? { d: B.minX - A.maxX, p: { x: A.maxX, y }, q: { x: B.minX, y } } : { d: A.minX - B.maxX, p: { x: A.minX, y }, q: { x: B.maxX, y } } }
    if (xo > 0) { const x = (Math.max(A.minX, B.minX) + Math.min(A.maxX, B.maxX)) / 2; return A.maxY <= B.minY ? { d: B.minY - A.maxY, p: { x, y: A.maxY }, q: { x, y: B.minY } } : { d: A.minY - B.maxY, p: { x, y: A.minY }, q: { x, y: B.maxY } } }
  }
  let best = { d: Infinity, p: a[0], q: b[0] }
  const test = (P: Point[], Q: Point[], flip: boolean) => {
    for (const p of P) for (let i = 0; i < Q.length; i++) {
      const q = segPoint(p, Q[i], Q[(i + 1) % Q.length]), d = Math.hypot(p.x - q.x, p.y - q.y)
      if (d < best.d) best = flip ? { d, p: q, q: p } : { d, p, q }
    }
  }
  test(a, b, false); test(b, a, true)
  return best
}
function entityClearance(A: Entity, B: Entity) {
  let best: { d: number; p: Point; q: Point; overlap: boolean } | null = null
  for (let i = 0; i < A.items.length; i++) for (let j = 0; j < B.items.length; j++) {
    const fa = A.items[i], fb = B.items[j]
    if (overlaps(fa, fb, -.5)) {
      const c = { x: (fa.x + fb.x) / 2, y: (fa.y + fb.y) / 2 }
      return { d: 0, p: c, q: c, overlap: true }
    }
    const c = polyClearance(A.polys[i], B.polys[j], fa, fb)
    if (!best || c.d < best.d) best = { ...c, overlap: false }
  }
  return best!
}
/** Distance from an entity's actual edges to each wall face (rotation and wall thickness included). */
function wallGaps(e: Entity, project: Project) {
  const r = interior(project)
  const pts = e.polys.flat()
  const extreme = (key: 'x' | 'y', pick: 'min' | 'max') => {
    const v = pick === 'min' ? Math.min(...pts.map(p => p[key])) : Math.max(...pts.map(p => p[key]))
    const on = pts.filter(p => Math.abs(p[key] - v) < .6), other = key === 'x' ? 'y' : 'x'
    return { v, at: on.reduce((s, p) => s + p[other], 0) / on.length }
  }
  const L = extreme('x', 'min'), R = extreme('x', 'max'), T = extreme('y', 'min'), B = extreme('y', 'max')
  return {
    left: { d: L.v - r.left, x1: r.left, y1: L.at, x2: L.v, y2: L.at },
    right: { d: r.right - R.v, x1: R.v, y1: R.at, x2: r.right, y2: R.at },
    top: { d: T.v - r.top, x1: T.at, y1: r.top, x2: T.at, y2: T.v },
    bottom: { d: r.bottom - B.v, x1: B.at, y1: B.v, x2: B.at, y2: r.bottom },
  }
}
function sizeLabel(f: Furniture) {
  if (f.kind === 'mirror-round') return `⌀ ${Math.round(f.width)} cm`
  if (isCircular(f)) return `⌀ ${Math.round(Math.min(f.width, f.depth))} cm`
  if (f.kind.startsWith('mirror-')) return `${Math.round(f.width)} × ${Math.round(f.height)} cm`
  return `${Math.round(f.width)} × ${Math.round(f.depth)} cm`
}

export function buildDims(project: Project, layout: Layout, o: MeasureOptions): Dim[] {
  if (o.mode === 'off') return []
  const dims: Dim[] = [], k = o.k, inc = o.include
  const { width: W, depth: D } = project.room
  const ents = entities(layout.furniture)
  const sel = o.selectedId ? ents.find(e => e.ids.includes(o.selectedId!)) ?? null : null
  const selItem = o.selectedId ? layout.furniture.find(f => f.id === o.selectedId) : undefined
  // ---- architecture
  const ring = 40 * k
  if (inc.room) {
    dims.push({ kind: 'room', x1: 0, y1: -ring, x2: W, y2: -ring, label: fmt(W), priority: 100 })
    dims.push({ kind: 'room', x1: -ring, y1: 0, x2: -ring, y2: D, label: fmt(D), priority: 100 })
  }
  if (inc.openings && (o.mode === 'all' || o.detail === 'detailed')) {
    // chain dimension along every wall that has openings: corner → opening → … → corner
    for (const wall of WALL_NAMES) {
      const ops = [...project.doors.filter(d => d.wall === wall).map(d => ({ s: d.start, e: d.start + d.width })), ...project.windows.filter(w => w.wall === wall).map(w => ({ s: w.start, e: w.start + w.width }))].sort((a, b) => a.s - b.s)
      const spec = project.walls[wall]
      if (!ops.length && spec.type === 'solid') continue
      const L = wallFrame(wall, project).length, cuts = [0, ...ops.flatMap(x => [x.s, x.e]), L]
      const off = (wall === 'top' || wall === 'left' ? 20 : 26) * k
      for (let i = 0; i < cuts.length - 1; i++) {
        if (cuts[i + 1] - cuts[i] < 1) continue
        const a = wallPoint(wall, project, cuts[i], -off), b = wallPoint(wall, project, cuts[i + 1], -off)
        dims.push({ kind: 'opening', x1: a.x, y1: a.y, x2: b.x, y2: b.y, label: fmt(cuts[i + 1] - cuts[i]), priority: 70 })
      }
      if (ops.length === 0 && spec.type !== 'solid' && !inc.room) {
        const a = wallPoint(wall, project, 0, -off), b = wallPoint(wall, project, L, -off)
        dims.push({ kind: 'opening', x1: a.x, y1: a.y, x2: b.x, y2: b.y, label: `${fmt(L)} ${spec.type === 'glass' ? 'glass' : 'open'}`, priority: 70 })
      }
    }
  } else if (inc.openings) {
    for (const d of project.doors) { const a = wallPoint(d.wall, project, d.start, -20 * k), b = wallPoint(d.wall, project, d.start + d.width, -20 * k); dims.push({ kind: 'opening', x1: a.x, y1: a.y, x2: b.x, y2: b.y, label: fmt(d.width), priority: 72 }) }
    for (const w of project.windows) { const a = wallPoint(w.wall, project, w.start, -20 * k), b = wallPoint(w.wall, project, w.start + w.width, -20 * k); dims.push({ kind: 'opening', x1: a.x, y1: a.y, x2: b.x, y2: b.y, label: fmt(w.width), priority: 71 }) }
  }
  const ext = exterior(project)
  if (inc.outdoor && ext) {
    const g = 22 * k
    dims.push({ kind: 'outdoor', x1: ext.left, y1: ext.bottom + g, x2: ext.right, y2: ext.bottom + g, label: `${fmt(ext.right - ext.left)} outdoor`, priority: 60 })
    dims.push({ kind: 'outdoor', x1: ext.right + g, y1: ext.top, x2: ext.right + g, y2: ext.bottom, label: fmt(ext.bottom - ext.top), priority: 60 })
  }
  // ---- furniture
  const targets = o.mode === 'all' ? ents : sel ? [sel] : []
  for (const e of targets) {
    const isSel = e === sel
    // sizes
    if (inc.furniture && (isSel || o.mode === 'all')) {
      const shown = isSel && selItem && e.items.length > 1 ? [selItem] : e.items
      for (const f of shown) {
        const P = footprint(f), maxY = Math.max(...P.map(p => p.y)), cx = P.reduce((s, p) => s + p.x, 0) / P.length
        dims.push({ kind: 'size', x1: cx, y1: maxY + 11 * k, x2: cx, y2: maxY + 11 * k, textOnly: true, label: sizeLabel(f), accent: isSel, priority: isSel ? 95 : 40 })
      }
      if (isSel && selItem?.mount === 'wall') {
        dims.push({ kind: 'size', x1: selItem.x, y1: selItem.y - 14 * k, x2: selItem.x, y2: selItem.y - 14 * k, textOnly: true, label: `${Math.round(selItem.elevation ?? 0)} cm above floor`, accent: true, priority: 90 })
      }
    }
    if (!e.solid && !isSel) continue
    // wall clearances
    if (inc.walls) {
      const g = wallGaps(e, project)
      const sides: WallName[] = (isSel && (o.detail === 'detailed' || o.mode === 'selected')) || (o.mode === 'all' && o.detail === 'detailed' && !o.compact && !o.selectedId) ? ['left', 'right', 'top', 'bottom'] : [g.left.d <= g.right.d ? 'left' : 'right', g.top.d <= g.bottom.d ? 'top' : 'bottom']
      for (const s of sides) { const m = g[s]; if (m.d > .5) dims.push({ kind: 'wall', x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, label: fmt(m.d), accent: isSel, priority: isSel ? 90 : 30 }) }
    }
  }
  // furniture-to-furniture clearances
  if (inc.pairs) {
    const solid = ents.filter(e => e.solid)
    const pairs = new Set<string>()
    const add = (A: Entity, B: Entity, accent: boolean, maxD: number) => {
      const key = [A.id, B.id].sort().join('|'); if (pairs.has(key)) return
      const c = entityClearance(A, B)
      if (c.overlap) { pairs.add(key); dims.push({ kind: 'overlap', x1: c.p.x, y1: c.p.y, x2: c.p.x, y2: c.p.y, textOnly: true, warn: true, label: 'Overlap', priority: 98 }); return }
      if (c.d > maxD || c.d < .5) return
      pairs.add(key); dims.push({ kind: 'pair', x1: c.p.x, y1: c.p.y, x2: c.q.x, y2: c.q.y, label: fmt(c.d), accent, priority: accent ? 85 : 25 })
    }
    if (sel?.solid) solid.filter(e => e !== sel).map(e => ({ e, d: entityClearance(sel, e).d })).sort((a, b) => a.d - b.d).slice(0, o.detail === 'detailed' ? 4 : 3).forEach(({ e }) => add(sel, e, true, 300))
    if (o.mode === 'all') for (const A of solid) {
      const near = solid.filter(B => B !== A).map(B => ({ B, d: entityClearance(A, B).d })).sort((a, b) => a.d - b.d)[0]
      if (near) add(A, near.B, false, o.detail === 'detailed' ? 250 : 150)
    }
  }
  return dims
}

/** Greedy label layout: higher-priority labels win; colliding ones are nudged
 *  along their line, then dropped (still inspectable by selecting the item). */
function layoutLabels(dims: Dim[], k: number, fs: number, compact: boolean) {
  const placed: { x: number; y: number; w: number; h: number }[] = []
  const out: (Dim & { lx: number; ly: number; vertical: boolean })[] = []
  const sorted = [...dims].sort((a, b) => b.priority - a.priority)
  for (const d of sorted) {
    const vertical = !d.textOnly && Math.abs(d.x2 - d.x1) < Math.abs(d.y2 - d.y1)
    const w = (d.label.length * fs * .56 + 6 * k), h = fs + 4 * k
    const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1)
    if (!d.textOnly && len < (vertical ? h : w) * .55 && compact && !d.accent) continue
    const tries = d.textOnly ? [0, 1, -1, 2] : [0, .25, -.25, .4, -.4]
    let ok: { x: number; y: number } | null = null
    for (const t of tries) {
      const x = d.textOnly ? d.x1 : (d.x1 + d.x2) / 2 + (d.x2 - d.x1) * t, y = d.textOnly ? d.y1 + t * h * 1.1 : (d.y1 + d.y2) / 2 + (d.y2 - d.y1) * t
      const bw = vertical ? h : w, bh = vertical ? w : h
      const box = { x: x - bw / 2, y: y - bh / 2, w: bw, h: bh }
      if (!placed.some(p => box.x < p.x + p.w && p.x < box.x + box.w && box.y < p.y + p.h && p.y < box.y + box.h)) { ok = { x, y }; placed.push(box); break }
    }
    if (!ok) { if (d.priority < 80) continue; ok = { x: d.textOnly ? d.x1 : (d.x1 + d.x2) / 2, y: d.textOnly ? d.y1 : (d.y1 + d.y2) / 2 } }
    out.push({ ...d, lx: ok.x, ly: ok.y, vertical })
  }
  return out
}

const INK = { muted: '#7d8780', accent: '#2f7a62', warn: '#c2493c', room: '#5f6b63' }
/** Architectural dimension lines with end ticks and haloed centimetre labels. */
export function DimensionLayer({ dims, k, compact = false }: { dims: Dim[]; k: number; compact?: boolean }) {
  const fs = (compact ? 10 : 10.5) * k
  const items = layoutLabels(dims, k, fs, compact)
  return <g className="dimension-layer" pointerEvents="none" fontFamily="'DM Sans', Arial, sans-serif">
    {items.map((d, i) => {
      const color = d.warn ? INK.warn : d.accent ? INK.accent : d.kind === 'room' ? INK.room : INK.muted
      if (d.textOnly) return <text key={i} x={d.lx} y={d.ly} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight={d.accent || d.warn ? 700 : 600} fill={color} stroke="#fbfbf8" strokeWidth={fs * .32} paintOrder="stroke" strokeLinejoin="round">{d.warn ? `⚠ ${d.label}` : d.label}</text>
      const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1, nx = -(d.y2 - d.y1) / len, ny = (d.x2 - d.x1) / len, t = 4 * k
      const sw = (d.accent ? 1.1 : .85) * k
      const angle = d.vertical ? -90 : 0
      return <g key={i}>
        <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={color} strokeOpacity={d.accent ? .9 : .6} strokeWidth={sw} />
        {[[d.x1, d.y1], [d.x2, d.y2]].map(([x, y], j) => <g key={j}>
          <line x1={x - nx * t} y1={y - ny * t} x2={x + nx * t} y2={y + ny * t} stroke={color} strokeOpacity={d.accent ? .9 : .65} strokeWidth={sw} />
          <line x1={x - (nx + (d.x2 - d.x1) / len * (j ? 1 : -1)) * t * .6} y1={y - (ny + (d.y2 - d.y1) / len * (j ? 1 : -1)) * t * .6} x2={x + (nx + (d.x2 - d.x1) / len * (j ? 1 : -1)) * t * .6} y2={y + (ny + (d.y2 - d.y1) / len * (j ? 1 : -1)) * t * .6} stroke={color} strokeOpacity={d.accent ? .9 : .65} strokeWidth={sw} />
        </g>)}
        <text x={d.lx} y={d.ly} transform={angle ? `rotate(${angle} ${d.lx} ${d.ly})` : undefined} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight={d.accent ? 700 : 600} fill={color} stroke="#fbfbf8" strokeWidth={fs * .34} paintOrder="stroke" strokeLinejoin="round">{d.label}</text>
      </g>
    })}
  </g>
}
/** Extra margin (plan units) needed around the room so outer annotations are not cropped. */
export function dimMargin(include: MeasureInclude, k: number) { return (include.room || include.openings ? 70 : 30) * k }
