import type { Furniture } from './model'
import { bounds, interior, type RoomLike } from './geometry'

/** Cloud Haven modular sofa (visualisation). Overall 320 × 195 × 80 cm:
 *  seat width 270 + two 25 cm arms; standard seat depth 72 + 33 cm back = 105;
 *  chaise seat depth 162 + 33 cm back = 195. Each seating section is its own
 *  furniture item (kind 'haven'); `groupId` ties sections into one sofa and
 *  `grouped` makes them move/rotate as one. Local frame: back at -y, front +y. */
export const HAVEN = { width: 320, depth: 195, height: 80, arm: 25, seat: 90, back: 33, depth1: 105, seatH: 47, armH: 62 }
export type HavenInfo = { type: 'seat' | 'chaise'; armL: boolean; armR: boolean; back: number; arm: number }
export type Arrangement = 'l-right' | 'l-left' | 'straight' | 'two' | 'blocks'
export const havenColors: Record<string, string> = { Beige: '#d6c8b3', Grey: '#a6a5a1', 'Off-white': '#ebe6dc', Mint: '#b7d0c1', Blue: '#8fa9c4', Navy: '#34425c' }
export const officialHavenColors = new Set(['Beige', 'Grey', 'Off-white']) // shown on ariika.com (Flatweave beige/grey, Tweed off-white/grey)
export const fabricNames = { flatweave: 'Flatweave', tweed: 'Tweed' } as const
export type Fabric = keyof typeof fabricNames

const id = () => crypto.randomUUID()
type Spec = { w: number; d: number; x: number; y: number; type: HavenInfo['type']; armL?: boolean; armR?: boolean; group: number; grouped: boolean; rot?: number }

function specs(a: Arrangement): Spec[] {
  const { arm: A, seat: S, depth1: D1, depth: D } = HAVEN
  const lRight: Spec[] = [
    { w: S + A, d: D1, x: -S / 2 - (S + A) / 2, y: -(D - D1) / 2, type: 'seat', armL: true, group: 0, grouped: true },
    { w: S, d: D1, x: 0, y: -(D - D1) / 2, type: 'seat', group: 0, grouped: true },
    { w: S + A, d: D, x: S / 2 + (S + A) / 2, y: 0, type: 'chaise', armR: true, group: 0, grouped: true },
  ]
  switch (a) {
    case 'l-right': return lRight
    case 'l-left': return lRight.map(s => ({ ...s, x: -s.x, armL: s.armR, armR: s.armL }))
    case 'straight': return [
      { w: S + A, d: D1, x: -S / 2 - (S + A) / 2, y: 0, type: 'seat', armL: true, group: 0, grouped: true },
      { w: S, d: D1, x: 0, y: 0, type: 'seat', group: 0, grouped: true },
      { w: S + A, d: D1, x: S / 2 + (S + A) / 2, y: 0, type: 'seat', armR: true, group: 0, grouped: true },
    ]
    case 'two': { // a two-seater and a separate chaise lounger, 40 cm apart
      const gap = 40, total = (S + A) + S + gap + (S + A), x0 = -total / 2
      return [
        { w: S + A, d: D1, x: x0 + (S + A) / 2, y: -(D - D1) / 2, type: 'seat', armL: true, group: 0, grouped: true },
        { w: S, d: D1, x: x0 + (S + A) + S / 2, y: -(D - D1) / 2, type: 'seat', group: 0, grouped: true },
        { w: S + A, d: D, x: x0 + (S + A) + S + gap + (S + A) / 2, y: 0, type: 'chaise', armR: true, group: 1, grouped: true },
      ]
    }
    case 'blocks': { // the same three sections, separated and ungrouped
      const gap = 30, total = (S + A) + S + (S + A) + gap * 2, x0 = -total / 2
      return [
        { w: S + A, d: D1, x: x0 + (S + A) / 2, y: -(D - D1) / 2, type: 'seat', armL: true, group: 0, grouped: false },
        { w: S, d: D1, x: x0 + (S + A) + gap + S / 2, y: -(D - D1) / 2, type: 'seat', group: 0, grouped: false },
        { w: S + A, d: D, x: x0 + (S + A) + S + gap * 2 + (S + A) / 2, y: 0, type: 'chaise', armR: true, group: 0, grouped: false },
      ]
    }
  }
}
/** Builds the modules of an arrangement centred on (cx, cy), rotated by `rotation`. */
export function buildHaven(a: Arrangement, cx: number, cy: number, rotation: number, look: { color: string; fabric: Fabric; material?: Furniture['material'] }, groupIds: string[] = []): Furniture[] {
  const r = rotation * Math.PI / 180, c = Math.cos(r), s = Math.sin(r)
  const gids = [groupIds[0] ?? id(), groupIds[1] ?? id()]
  return specs(a).map((sp, i) => ({
    id: id(), kind: 'haven', name: sp.type === 'chaise' ? 'Cloud Haven chaise' : 'Cloud Haven seat',
    width: sp.w, depth: sp.d, height: HAVEN.height, x: cx + sp.x * c - sp.y * s, y: cy + sp.x * s + sp.y * c, rotation,
    color: look.color, material: look.material ?? 'grey', fabric: look.fabric,
    hv: { type: sp.type, armL: !!sp.armL, armR: !!sp.armR, back: HAVEN.back, arm: HAVEN.arm },
    groupId: gids[sp.group], grouped: sp.grouped, order: i,
  } as Furniture))
}
export const isHaven = (f: Furniture) => f.kind === 'haven'
export const hvOf = (f: Furniture): HavenInfo => f.hv ?? { type: f.depth > 150 ? 'chaise' : 'seat', armL: false, armR: false, back: Math.min(HAVEN.back, f.depth * .35), arm: HAVEN.arm }
/** Members that move together with `item` (itself only when not grouped). */
export function groupOf(item: Furniture, all: Furniture[]) {
  if (!item.groupId || !item.grouped) return [item]
  return all.filter(f => f.groupId === item.groupId && f.grouped)
}
export function sameGroup(item: Furniture, all: Furniture[]) { return item.groupId ? all.filter(f => f.groupId === item.groupId) : [item] }
export function unionBounds(items: Furniture[]) {
  const bs = items.map(bounds)
  return { minX: Math.min(...bs.map(b => b.minX)), maxX: Math.max(...bs.map(b => b.maxX)), minY: Math.min(...bs.map(b => b.minY)), maxY: Math.max(...bs.map(b => b.maxY)) }
}
export function translate(items: Furniture[], dx: number, dy: number) { return items.map(f => ({ ...f, x: f.x + dx, y: f.y + dy })) }
/** Moves a set of items the minimum amount so their combined footprint is inside the room. */
export function clampGroup(items: Furniture[], project: RoomLike): Furniture[] | null {
  const u = unionBounds(items), r = interior(project)
  if (u.maxX - u.minX > r.right - r.left + .001 || u.maxY - u.minY > r.bottom - r.top + .001) return null
  const dx = u.minX < r.left ? r.left - u.minX : u.maxX > r.right ? r.right - u.maxX : 0
  const dy = u.minY < r.top ? r.top - u.minY : u.maxY > r.bottom ? r.bottom - u.maxY : 0
  return translate(items, dx, dy)
}
export function rotateGroup(items: Furniture[], delta: number, pivot?: { x: number; y: number }) {
  const u = unionBounds(items), cx = pivot?.x ?? (u.minX + u.maxX) / 2, cy = pivot?.y ?? (u.minY + u.maxY) / 2
  const a = delta * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  return items.map(f => { const dx = f.x - cx, dy = f.y - cy; return { ...f, x: cx + dx * c - dy * s, y: cy + dx * s + dy * c, rotation: (((f.rotation + delta) % 360) + 360) % 360 } })
}
/** Group frame: rotation of the first member, origin at the footprint centre. */
function frame(items: Furniture[]) {
  const u = unionBounds(items), rot = items[0].rotation, a = rot * Math.PI / 180
  return { cx: (u.minX + u.maxX) / 2, cy: (u.minY + u.maxY) / 2, rot, c: Math.cos(a), s: Math.sin(a) }
}
const rel = (f: Furniture, rot: number) => ((((f.rotation - rot) % 360) + 360) % 360)
const quarterTurn = (deg: number) => Math.abs(((deg % 180) + 180) % 180 - 90) < 1
/** Overall size of the sofa measured in its own frame. */
export function groupSize(items: Furniture[]) {
  const F = frame(items)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const f of items) {
    const rr = rel(f, F.rot) * Math.PI / 180, c = Math.cos(rr), s = Math.sin(rr)
    const lx = (f.x - F.cx) * F.c + (f.y - F.cy) * F.s, ly = -(f.x - F.cx) * F.s + (f.y - F.cy) * F.c
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = lx + dx * f.width / 2 * c - dy * f.depth / 2 * s, py = ly + dx * f.width / 2 * s + dy * f.depth / 2 * c
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py)
    }
  }
  return { width: maxX - minX, depth: maxY - minY, height: Math.max(...items.map(f => f.height)) }
}
/** Rescales a single module, keeping its back-cushion and arm proportions. */
export function resizeModule(f: Furniture, width: number, depth: number, height = f.height): Furniture {
  if (!isHaven(f)) return { ...f, width, depth, height }
  const hv = hvOf(f)
  return { ...f, width, depth, height, hv: { ...hv, back: hv.back * depth / f.depth, arm: hv.arm * width / f.width } }
}
/** Scales a whole sofa in its own frame so that its overall size becomes w × d × h. */
export function scaleGroup(items: Furniture[], w: number, d: number, h: number) {
  const F = frame(items), size = groupSize(items)
  const sx = w / size.width, sy = d / size.depth, sz = h / size.height
  return items.map(f => {
    const lx = (f.x - F.cx) * F.c + (f.y - F.cy) * F.s, ly = -(f.x - F.cx) * F.s + (f.y - F.cy) * F.c
    const nx = lx * sx, ny = ly * sy
    const swap = quarterTurn(rel(f, F.rot))
    const scaled = resizeModule(f, f.width * (swap ? sy : sx), f.depth * (swap ? sx : sy), f.height * sz)
    return { ...scaled, x: F.cx + nx * F.c - ny * F.s, y: F.cy + nx * F.s + ny * F.c }
  })
}
/** Mirrors a sofa left ↔ right in its own frame (chaise position switch). */
export function mirrorGroup(items: Furniture[]) {
  const F = frame(items)
  return items.map(f => {
    const lx = (f.x - F.cx) * F.c + (f.y - F.cy) * F.s, ly = -(f.x - F.cx) * F.s + (f.y - F.cy) * F.c
    const nx = -lx, r = rel(f, F.rot)
    const hv = hvOf(f)
    return { ...f, x: F.cx + nx * F.c - ly * F.s, y: F.cy + nx * F.s + ly * F.c, rotation: (((F.rot - r) % 360) + 360) % 360, hv: { ...hv, armL: hv.armR, armR: hv.armL } }
  })
}
/** Which side the chaise sits on, seen by someone facing the sofa's front. */
export function chaiseSide(items: Furniture[]): 'left' | 'right' | null {
  const ch = items.find(f => hvOf(f).type === 'chaise'); if (!ch || items.length < 2) return null
  const F = frame(items), lx = (ch.x - F.cx) * F.c + (ch.y - F.cy) * F.s
  return lx >= 0 ? 'right' : 'left'
}

/** Magnetic snapping: pulls a dragged module flush against nearby sofa modules
 *  whose axes are parallel to it, and aligns their front/back or side edges. */
export function magnetSnap(item: Furniture, others: Furniture[], threshold = 14): { item: Furniture; guides: { x1: number; y1: number; x2: number; y2: number }[] } {
  let best: { dx: number; dy: number; score: number; guide: { x1: number; y1: number; x2: number; y2: number } } | null = null
  for (const o of others) {
    const r = rel(item, o.rotation); if (Math.abs(((r % 90) + 90) % 90) > 1 && Math.abs(((r % 90) + 90) % 90 - 90) > 1) continue
    const swap = quarterTurn(r), hw = (swap ? item.depth : item.width) / 2, hd = (swap ? item.width : item.depth) / 2
    const a = o.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
    const lx = (item.x - o.x) * c + (item.y - o.y) * s, ly = -(item.x - o.x) * s + (item.y - o.y) * c
    const OW = o.width / 2, OD = o.depth / 2
    const near = (v: number) => Math.abs(v) <= threshold
    const tryAxis = (touch: number[], align: number[], overlap: boolean) => {
      const t = touch.filter(near).sort((p, q) => Math.abs(p) - Math.abs(q))[0]
      const al = align.filter(near).sort((p, q) => Math.abs(p) - Math.abs(q))[0]
      return overlap && t !== undefined ? { t, al: al ?? 0 } : null
    }
    // side by side (touch on x), aligned backs/fronts on y
    const sx = tryAxis([(OW + hw) - lx, (-OW - hw) - lx], [(-OD + hd) - ly, (OD - hd) - ly], Math.abs(ly) < OD + hd - 5)
    // front/back contact (touch on y), aligned sides on x
    const sy = tryAxis([(OD + hd) - ly, (-OD - hd) - ly], [(-OW + hw) - lx, (OW - hw) - lx], Math.abs(lx) < OW + hw - 5)
    const cands: { lx: number; ly: number; score: number; edge: [number, number, number, number] }[] = []
    if (sx) { const nx = lx + sx.t, ny = ly + sx.al, ex = Math.sign(nx) * OW; cands.push({ lx: nx, ly: ny, score: Math.abs(sx.t) + Math.abs(sx.al) * .5, edge: [ex, Math.max(-OD, ny - hd), ex, Math.min(OD, ny + hd)] }) }
    if (sy) { const nx = lx + sy.al, ny = ly + sy.t, ey = Math.sign(ny) * OD; cands.push({ lx: nx, ly: ny, score: Math.abs(sy.t) + Math.abs(sy.al) * .5, edge: [Math.max(-OW, nx - hw), ey, Math.min(OW, nx + hw), ey] }) }
    for (const cd of cands) {
      if (best && cd.score >= best.score) continue
      const wx = o.x + cd.lx * c - cd.ly * s, wy = o.y + cd.lx * s + cd.ly * c
      const [ax, ay, bx, by] = cd.edge
      best = { dx: wx - item.x, dy: wy - item.y, score: cd.score, guide: { x1: o.x + ax * c - ay * s, y1: o.y + ax * s + ay * c, x2: o.x + bx * c - by * s, y2: o.y + bx * s + by * c } }
    }
  }
  return best ? { item: { ...item, x: item.x + best.dx, y: item.y + best.dy }, guides: [best.guide] } : { item, guides: [] }
}
