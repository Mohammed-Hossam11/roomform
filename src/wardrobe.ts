/**
 * Luxury Modular L-Shaped Wardrobe: three grouped sections that share a
 * `groupId` (the same mechanism as the Cloud Haven sofa):
 *   - corner: a square walnut corner unit with a 45° full-height mirror face,
 *   - run A ("Side A"): doors + an open, LED-lit shelf column with drawers,
 *   - run B ("Side B"): tall doors.
 * Every section keeps its own length (width), depth, height, colour and door
 * count. Grouping re-attaches both runs to the corner, so the L reconnects.
 * Local frames: back = -y, front = +y, left = -x (same as all furniture).
 */
import type { Furniture, LuxInfo } from './model'
import { uid } from './compat'

export const LUX_KIND = 'wardrobe-lux' as const
export const LUX_DEFAULTS = { lengthA: 200, lengthB: 160, depth: 60, height: 240, door: '#e4dbcd', walnut: '#5e4433' }
export const isLux = (f: Pick<Furniture, 'kind'>) => f.kind === LUX_KIND
export const luxOf = (f: Furniture): LuxInfo => f.lux ?? { part: 'run', side: 'A' }
export const isLuxCorner = (f: Furniture) => isLux(f) && luxOf(f).part === 'corner'
/** What a run's end column shows. Saves without `style` keep their old look. */
export function luxColumn(f: Furniture): { col: boolean; lower: 'drawers' | 'door' | 'open' } {
  const l = luxOf(f)
  if (l.style === 'doors') return { col: false, lower: 'door' }
  if (l.style === 'led') return { col: true, lower: 'open' }
  if (l.style === 'drawers') return { col: true, lower: 'drawers' }
  return { col: !!l.shelves, lower: l.drawers ? 'drawers' : 'door' }
}
export const luxStyleOf = (f: Furniture) => { const c = luxColumn(f); return !c.col ? 'doors' : c.lower === 'drawers' ? 'drawers' : 'led' }
export const luxMirror = (f: Furniture) => luxOf(f).mirror !== false
/** Corner size: deeper than both runs so the mirror face has room. */
export const cornerSize = (depthA: number, depthB: number) => Math.max(depthA, depthB) + 40

export function luxSections(items: Furniture[]) {
  return {
    corner: items.find(f => isLux(f) && luxOf(f).part === 'corner'),
    a: items.find(f => isLux(f) && luxOf(f).part === 'run' && luxOf(f).side === 'A'),
    b: items.find(f => isLux(f) && luxOf(f).part === 'run' && luxOf(f).side === 'B'),
  }
}

/** Puts the runs back against the corner unit (keeping the corner's outer
 *  back-left point and rotation fixed) and resizes the corner to fit. */
export function relayoutLux(items: Furniture[]): Furniture[] {
  const { corner, a, b } = luxSections(items)
  if (!corner) return items
  const tA = a?.depth ?? LUX_DEFAULTS.depth, tB = b?.depth ?? LUX_DEFAULTS.depth, c = cornerSize(tA, tB)
  const R = corner.rotation, r = R * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r)
  const ox = corner.x + (-corner.width / 2) * cs - (-corner.depth / 2) * sn
  const oy = corner.y + (-corner.width / 2) * sn + (-corner.depth / 2) * cs
  const at = (lx: number, ly: number) => ({ x: ox + lx * cs - ly * sn, y: oy + lx * sn + ly * cs })
  return items.map(f => {
    if (f.id === corner.id) return { ...f, width: c, depth: c, ...at(c / 2, c / 2), lux: { ...luxOf(f), depthA: tA, depthB: tB } }
    if (a && f.id === a.id) return { ...f, rotation: R, ...at(c + f.width / 2, tA / 2) }
    if (b && f.id === b.id) return { ...f, rotation: ((R + 270) % 360 + 360) % 360, ...at(tB / 2, c + f.width / 2) }
    return f
  })
}

/** A new grouped wardrobe whose outer corner sits at (x, y) - the group's
 *  top-left when unrotated. */
export function buildLux(x: number, y: number, o: { lengthA?: number; lengthB?: number; depth?: number; height?: number } = {}): Furniture[] {
  const g = uid(), d = o.depth ?? LUX_DEFAULTS.depth, h = o.height ?? LUX_DEFAULTS.height, c = cornerSize(d, d)
  const base = { kind: LUX_KIND, material: 'light-wood' as const, color: LUX_DEFAULTS.door, accent: LUX_DEFAULTS.walnut, groupId: g, grouped: true, rotation: 0, height: h }
  const items: Furniture[] = [
    { ...base, id: uid(), name: 'Luxury Wardrobe · Corner Mirror', width: c, depth: c, x: x + c / 2, y: y + c / 2, lux: { part: 'corner', depthA: d, depthB: d, mirror: true }, order: 0 },
    { ...base, id: uid(), name: 'Luxury Wardrobe · Side A', width: o.lengthA ?? LUX_DEFAULTS.lengthA, depth: d, x: 0, y: 0, lux: { part: 'run', side: 'A', style: 'drawers' }, order: 1 },
    { ...base, id: uid(), name: 'Luxury Wardrobe · Side B', width: o.lengthB ?? LUX_DEFAULTS.lengthB, depth: d, x: 0, y: 0, lux: { part: 'run', side: 'B', style: 'doors' }, order: 2 },
  ]
  return relayoutLux(items)
}

/** Corner footprint outline (local cm): a square with its front-right corner
 *  cut at 45°; the cut is the mirror face. */
export function luxCornerOutline(f: Furniture) {
  const c = f.width / 2, l = luxOf(f), tA = Math.min(l.depthA ?? 60, f.depth - 10), tB = Math.min(l.depthB ?? 60, f.width - 10)
  return { pts: [{ x: -c, y: -c }, { x: c, y: -c }, { x: c, y: -c + tA }, { x: -c + tB, y: c }, { x: -c, y: c }], mirror: { a: { x: c, y: -c + tA }, b: { x: -c + tB, y: c } }, tA, tB }
}

/** Front layout of a run (local cm along x): doors, and the optional shelf
 *  column at the end away from the corner. Side A's corner end is -x;
 *  Side B is mounted turned 270°, so its corner end is +x. */
export function luxRunLayout(f: Furniture) {
  const l = luxOf(f), W = f.width, frame = 3
  const colW = luxColumn(f).col ? Math.max(40, Math.min(55, Math.round(W * .24))) : 0
  const farIsRight = l.side !== 'B'
  const x0 = -W / 2 + frame, x1 = W / 2 - frame
  const col = colW ? (farIsRight ? { a: x1 - colW, b: x1 } : { a: x0, b: x0 + colW }) : null
  const da = col && !farIsRight ? col.b : x0, db = col && farIsRight ? col.a : x1
  const n = Math.max(1, Math.min(8, l.doors ?? Math.max(1, Math.round((db - da) / 48))))
  const doors = Array.from({ length: n }, (_, i) => ({ a: da + (db - da) * i / n, b: da + (db - da) * (i + 1) / n }))
  return { doors, col, frame }
}
