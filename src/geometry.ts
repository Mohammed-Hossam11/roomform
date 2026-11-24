import type { Door, Furniture, FurnitureKind, Project, WallName } from './model'
import { clone } from './compat'

export type Point = { x: number; y: number }
// Walls are centered on the nominal room outline (default 9 cm thick), in the
// SVG plan and in 3D alike, so the usable floor starts half a wall inside it.
// Open sides have no wall, so the floor runs to the outline there.
// Every placement check (drag, rotate, resize, duplicate, generate, import,
// room resize) goes through `bounds` / `inside` / `clampInside` below.
export const WALL_THICKNESS = 9
export const WALL_INSET = WALL_THICKNESS / 2
export type RoomLike = Pick<Project,'room'> & Partial<Pick<Project,'walls'|'outdoor'>>
const OUTDOOR: FurnitureKind[] = ['outdoor-sofa', 'garden-chair', 'outdoor-table', 'lounger', 'planter']
export const isOutdoorItem = (f: Pick<Furniture,'kind'>) => OUTDOOR.includes(f.kind)
export function wallThickness(project: RoomLike, wall: WallName) { const s = project.walls?.[wall]; return s ? (s.type === 'open' ? 0 : s.thickness) : WALL_THICKNESS }
export function wallInset(project: RoomLike, wall: WallName) { return wallThickness(project, wall) / 2 }
export function interior(project: RoomLike) { return { left: wallInset(project,'left'), top: wallInset(project,'top'), right: project.room.width-wallInset(project,'right'), bottom: project.room.depth-wallInset(project,'bottom') } }
/** The outdoor ground rectangle around the room (room outline + extents), or null. */
export function exterior(project: RoomLike) {
  const o = project.outdoor
  if (!o || !o.visible || o.ground === 'none') return null
  return { left: -o.extend.left, top: -o.extend.top, right: project.room.width + o.extend.right, bottom: project.room.depth + o.extend.bottom }
}
/** Where an item may stand: outdoor furniture may use the whole outdoor area. */
export function areaFor(f: Pick<Furniture,'kind'>, project: RoomLike) { return (isOutdoorItem(f) && exterior(project)) || interior(project) }

/** Coordinate frame of a wall: origin at its first corner, `a` runs along it,
 *  `n` points into the room. */
export function wallFrame(wall: WallName, project: RoomLike) {
  const W=project.room.width, D=project.room.depth
  switch (wall) {
    case 'top': return { ox:0, oy:0, ax:1, ay:0, nx:0, ny:1, length:W }
    case 'bottom': return { ox:0, oy:D, ax:1, ay:0, nx:0, ny:-1, length:W }
    case 'left': return { ox:0, oy:0, ax:0, ay:1, nx:1, ny:0, length:D }
    case 'right': return { ox:W, oy:0, ax:0, ay:1, nx:-1, ny:0, length:D }
  }
}
export function wallPoint(wall: WallName, project: RoomLike, along: number, inward = 0): Point {
  const f=wallFrame(wall,project); return { x: f.ox+f.ax*along+f.nx*inward, y: f.oy+f.ay*along+f.ny*inward }
}
function toWall(wall: WallName, project: RoomLike, p: Point) {
  const f=wallFrame(wall,project); const dx=p.x-f.ox, dy=p.y-f.oy
  return { along: dx*f.ax+dy*f.ay, inward: dx*f.nx+dy*f.ny }
}

export function corners(f: Furniture): Point[] {
  const angle = f.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  return [[-f.width/2,-f.depth/2],[f.width/2,-f.depth/2],[f.width/2,f.depth/2],[-f.width/2,f.depth/2]].map(([dx,dy]) => ({ x: f.x + dx*c - dy*s, y: f.y + dx*s + dy*c }))
}
/** Items with a circular footprint (round rugs, the Halo side table). */
export const isCircular = (f: Furniture) => (f.kind === 'rug' && f.rugShape === 'circle') || f.kind === 'halo-table'
/** Axis-aligned footprint of the item after rotation (circles ignore rotation). */
export function bounds(f: Furniture) {
  if(isCircular(f)) return {minX:f.x-f.width/2,maxX:f.x+f.width/2,minY:f.y-f.depth/2,maxY:f.y+f.depth/2}
  const pts = corners(f)
  return { minX: Math.min(...pts.map(p=>p.x)), maxX: Math.max(...pts.map(p=>p.x)), minY: Math.min(...pts.map(p=>p.y)), maxY: Math.max(...pts.map(p=>p.y)) }
}
export function inside(f: Furniture, project: RoomLike) {
  const b = bounds(f)
  const r=areaFor(f,project)
  return Number.isFinite(b.minX) && b.minX >= r.left - 0.001 && b.minY >= r.top - 0.001 && b.maxX <= r.right + 0.001 && b.maxY <= r.bottom + 0.001
}
function projectAxis(points: Point[], axis: Point) { const vals = points.map(p => p.x*axis.x+p.y*axis.y); return [Math.min(...vals), Math.max(...vals)] }
function circleHits(c: Furniture, o: Furniture, gap: number) {
  const r = Math.min(c.width, c.depth) / 2 + gap
  if (isCircular(o)) return Math.hypot(c.x - o.x, c.y - o.y) < r + Math.min(o.width, o.depth) / 2
  // closest point of the rotated rectangle to the circle centre
  const a = -o.rotation * Math.PI / 180, dx = c.x - o.x, dy = c.y - o.y
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a)
  const qx = Math.max(-o.width / 2, Math.min(o.width / 2, lx)), qy = Math.max(-o.depth / 2, Math.min(o.depth / 2, ly))
  return Math.hypot(lx - qx, ly - qy) < r
}
export function overlaps(a: Furniture, b: Furniture, gap = 0) {
  if (isCircular(a)) return circleHits(a, b, gap)
  if (isCircular(b)) return circleHits(b, a, gap)
  const aa = corners(a), bb = corners(b)
  for (const poly of [aa, bb]) for (let i=0;i<4;i++) {
    const p=poly[i], q=poly[(i+1)%4], axis={x:-(q.y-p.y), y:q.x-p.x}
    const [a0,a1]=projectAxis(aa,axis), [b0,b1]=projectAxis(bb,axis)
    const len=Math.hypot(axis.x,axis.y)
    if (a1+gap*len <= b0 || b1+gap*len <= a0) return false
  }
  return true
}
const SURFACES: Partial<Record<FurnitureKind, FurnitureKind[]>> = {
  'tv-stand': ['tv-unit'],
  monitor: ['desk', 'tv-unit', 'dresser'],
  vase: ['desk', 'bedside', 'dresser', 'shelf', 'tv-unit', 'rattan-table', 'halo-table', 'outdoor-table'],
  decor: ['desk', 'bedside', 'dresser', 'shelf', 'tv-unit', 'rattan-table', 'halo-table', 'outdoor-table'],
}
export const isEligibleSupport = (item: Furniture, support: Furniture) => item.id !== support.id && !!SURFACES[item.kind]?.includes(support.kind)
/** The complete rotated object footprint must fit on the usable upper surface. */
export function canSupport(item: Furniture, support: Furniture): boolean {
  if (!isEligibleSupport(item, support) || support.height <= 0) return false
  const a = -support.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  const margin = 1.5
  return corners(item).every(p => {
    const dx = p.x - support.x, dy = p.y - support.y
    const x = dx * c - dy * s, y = dx * s + dy * c
    return isCircular(support)
      ? Math.hypot(x, y) <= Math.min(support.width, support.depth) / 2 - margin
      : Math.abs(x) <= support.width / 2 - margin && Math.abs(y) <= support.depth / 2 - margin
  })
}
export function findSupport(item: Furniture, furniture: Furniture[]): Furniture | undefined {
  return furniture.filter(other => canSupport(item.kind === 'tv-stand' && item.supportId !== other.id ? { ...item, rotation: other.rotation + 180 } : item, other))
    .sort((a, b) => b.height - a.height || Math.hypot(item.x - a.x, item.y - a.y) - Math.hypot(item.x - b.x, item.y - b.y))[0]
}
/** Keep children in the same local position when their supporting item moves. */
export function followSupport(child: Furniture, before: Furniture, after: Furniture): Furniture {
  const old = -before.rotation * Math.PI / 180, next = after.rotation * Math.PI / 180
  const dx = child.x - before.x, dy = child.y - before.y
  const lx = dx * Math.cos(old) - dy * Math.sin(old), ly = dx * Math.sin(old) + dy * Math.cos(old)
  return { ...child, x: after.x + lx * Math.cos(next) - ly * Math.sin(next), y: after.y + lx * Math.sin(next) + ly * Math.cos(next), rotation: child.rotation + after.rotation - before.rotation }
}
/** Solid items collide; rugs and wall-mounted mirrors are not floor furniture. */
export const isSolid = (f: Furniture) => f.kind !== 'rug' && f.mount !== 'wall'
const WALL_ORDER: WallName[] = ['top', 'right', 'bottom', 'left']
const solidWalls = (project: RoomLike) => WALL_ORDER.filter(w => (project.walls?.[w]?.type ?? 'solid') === 'solid')
/** Rotation that makes an item's front (local +y) face into the room from `wall`. */
export const wallFacing: Record<WallName, number> = { top: 0, right: 90, bottom: 180, left: 270 }
/** Places a wall-mounted item flat against the inner face of a solid wall,
 *  keeping it within the wall's length and below the ceiling. Returns null
 *  when the room has no solid wall or the item is wider than the wall. */
export function mountOnWall(f: Furniture, project: RoomLike, wall = f.wall ?? 'top', along = f.along ?? 0): Furniture | null {
  const solid = solidWalls(project)
  if (!solid.length) return null
  if (!solid.includes(wall)) wall = solid[0]
  const fr = wallFrame(wall, project), [a0, a1] = fr.ax ? (['left', 'right'] as WallName[]) : (['top', 'bottom'] as WallName[])
  const lo = wallInset(project, a0) + f.width / 2, hi = fr.length - wallInset(project, a1) - f.width / 2
  if (hi < lo) return null
  const pos = Math.max(lo, Math.min(hi, along || fr.length / 2))
  const elevation = Math.max(0, Math.min(project.room.ceiling - f.height, f.elevation ?? 0))
  const p = wallPoint(wall, project, pos, wallInset(project, wall) + f.depth / 2)
  return { ...f, wall, along: pos, elevation, x: p.x, y: p.y, rotation: wallFacing[wall] }
}
/** Wall-mounted item dragged to `pt`: snaps to the nearest solid wall. */
export function mountNearest(f: Furniture, project: RoomLike, pt: Point): Furniture | null {
  let best: { wall: WallName; along: number; dist: number } | null = null
  for (const w of solidWalls(project)) {
    const t = toWall(w, project, pt), L = wallFrame(w, project).length
    const dist = Math.abs(t.inward) + Math.max(0, -t.along, t.along - L)
    if (!best || dist < best.dist) best = { wall: w, along: t.along, dist }
  }
  return best ? mountOnWall(f, project, best.wall, best.along) : null
}
/** Next solid wall clockwise (the Rotate 90° action for wall-mounted items). */
export function nextWall(f: Furniture, project: RoomLike): WallName | null {
  const solid = solidWalls(project); if (!solid.length) return null
  const i = WALL_ORDER.indexOf(f.wall ?? 'top')
  for (let k = 1; k <= 4; k++) { const w = WALL_ORDER[(i + k) % 4]; if (solid.includes(w)) return w }
  return null
}
export function collides(f: Furniture, all: Furniture[], gap = 0) {
  // A 0.5 cm tolerance lets snapped sections and furniture sit flush without warnings.
  return isSolid(f) && all.some(o => o.id !== f.id && isSolid(o) && f.supportId !== o.id && o.supportId !== f.id && overlaps(f, o, gap - .5))
}

/** Hinge, closed-leaf direction and swing side of a door, in room coordinates. */
export function doorGeometry(project: Project, door: Door) {
  const hingeAlong = door.hinge === 'end' ? door.start + door.width : door.start
  const freeAlong = door.hinge === 'end' ? door.start : door.start + door.width
  const sign = door.swing === 'in' ? 1 : -1
  return {
    hinge: wallPoint(door.wall, project, hingeAlong),
    free: wallPoint(door.wall, project, freeAlong),
    leafTip: wallPoint(door.wall, project, hingeAlong, sign * door.width),
    hingeAlong, freeAlong, sign,
  }
}
function edgeSamples(f: Furniture) {
  const pts = corners(f), out: Point[] = [...pts, { x: f.x, y: f.y }]
  for (let i=0;i<4;i++) for (let t=1;t<10;t++) { const p=pts[i], q=pts[(i+1)%4]; out.push({ x:p.x+(q.x-p.x)*t/10, y:p.y+(q.y-p.y)*t/10 }) }
  return out
}
export function doorBlocked(f: Furniture, project: Project) {
  if (isOutdoorItem(f)) return false
  const samples = edgeSamples(f)
  return project.doors.some(door => {
    const g = doorGeometry(project, door)
    const radius = door.width + 8
    const towardOpening = g.freeAlong > g.hingeAlong ? 1 : -1
    return samples.some(p => {
      const w = toWall(door.wall, project, p)
      if (door.kind !== 'sliding' && door.swing === 'in') {
        return w.inward >= 0 && (w.along - g.hingeAlong) * towardOpening >= -2 && Math.hypot(w.along - g.hingeAlong, w.inward) < radius
      }
      // Sliding and outward-opening doors still need a clear entry zone inside the room.
      return w.inward >= 0 && w.inward < 60 && w.along > door.start - 2 && w.along < door.start + door.width + 2
    })
  })
}
export function warnings(f: Furniture, all: Furniture[], project: Project): string[] {
  const result: string[] = []
  if (!inside(f, project)) result.push('Part of this item is outside the room')
  if (f.mount === 'wall' && f.wall) {
    const top = (f.elevation ?? 0) + f.height, a0 = (f.along ?? 0) - f.width / 2, a1 = (f.along ?? 0) + f.width / 2
    const hit = (o: { wall: WallName; start: number; width: number }, y0: number, y1: number) => o.wall === f.wall && o.start < a1 && a0 < o.start + o.width && y0 < top && (f.elevation ?? 0) < y1
    if (project.doors.some(d => hit(d, 0, d.height)) || project.windows.some(w => hit(w, w.sill, w.sill + w.height))) result.push('Covers a door or window on this wall')
    if (project.walls?.[f.wall]?.type !== 'solid') result.push('This wall is not solid — move the mirror to a solid wall')
    if (top > project.room.ceiling + .01) result.push('Taller than the wall')
  }
  if (!isSolid(f)) return result
  if (collides(f, all)) result.push('Overlaps another furniture item')
  const blocked = doorBlocked(f, project)
  if (blocked) result.push('Blocks the door swing or entry clearance')
  else if (!isOutdoorItem(f)) {
    const samples = edgeSamples(f)
    if (project.doors.some(door => samples.map(p => toWall(door.wall, project, p)).some(w => w.along > door.start - 30 && w.along < door.start + door.width + 30 && w.inward > 0 && w.inward < 130))) result.push('Narrows the entry circulation area')
  }
  return result
}
/** Moves the item the minimum distance needed to sit fully inside the room.
 *  Returns null when its rotated footprint is larger than the room. */
export function clampInside(f: Furniture, project: RoomLike): Furniture | null {
  if (![f.width,f.depth,f.x,f.y,f.rotation].every(Number.isFinite) || f.width<=0 || f.depth<=0) return null
  if (f.mount === 'wall') return mountOnWall(f, project)
  const b=bounds(f), r=areaFor(f,project)
  const offX=f.x-(b.minX+b.maxX)/2, offY=f.y-(b.minY+b.maxY)/2
  const halfW=(b.maxX-b.minX)/2, halfD=(b.maxY-b.minY)/2
  if (halfW*2>r.right-r.left+0.001 || halfD*2>r.bottom-r.top+0.001) return null
  const cx=Math.max(r.left+halfW,Math.min(r.right-halfW,f.x-offX)), cy=Math.max(r.top+halfD,Math.min(r.bottom-halfD,f.y-offY))
  return { ...f, x:cx+offX, y:cy+offY }
}
/** Clamps inside the room, then — if the item collides with solid furniture —
 *  searches outward for the nearest free position. Falls back to the clamped
 *  position when no free spot exists (the overlap then shows as a warning). */
export function placeNear(f: Furniture, others: Furniture[], project: Project): { item: Furniture; free: boolean } | null {
  const clamped = clampInside(f, project)
  if (!clamped) return null
  if (!collides(clamped, others)) return { item: clamped, free: true }
  const step = 5, maxR = Math.max(project.room.width, project.room.depth)
  for (let r = step; r <= maxR; r += step) {
    const n = Math.max(8, Math.round(2 * Math.PI * r / step))
    let best: Furniture | null = null, bestD = Infinity
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2
      const c = clampInside({ ...clamped, x: clamped.x + Math.cos(a) * r, y: clamped.y + Math.sin(a) * r }, project)
      if (!c || collides(c, others)) continue
      const d = Math.hypot(c.x - clamped.x, c.y - clamped.y)
      if (d < bestD) { best = c; bestD = d }
    }
    if (best) return { item: best, free: true }
  }
  return { item: clamped, free: false }
}
export function snapToWalls(f: Furniture, project: RoomLike, threshold=12): Furniture {
  const next={...f}; const b=bounds(next), r=interior(project)
  if (Math.abs(b.minX-r.left)<threshold) next.x+=r.left-b.minX
  else if (Math.abs(r.right-b.maxX)<threshold) next.x+=r.right-b.maxX
  if (Math.abs(b.minY-r.top)<threshold) next.y+=r.top-b.minY
  else if (Math.abs(r.bottom-b.maxY)<threshold) next.y+=r.bottom-b.maxY
  return next
}
export function distanceToWalls(f: Furniture, project: RoomLike) {
  const b=bounds(f), r=interior(project)
  return { left: Math.round(b.minX-r.left), right: Math.round(r.right-b.maxX), top: Math.round(b.minY-r.top), bottom: Math.round(r.bottom-b.maxY) }
}

/** Which openings a wall type can hold: open sides hold none, glass walls hold
 *  doors only (they are already glazed), solid walls hold everything. */
export function openingIssues(project: Project, wall: WallName, type: 'solid' | 'glass' | 'open'): string[] {
  if (type === 'solid') return []
  const out: string[] = []
  project.doors.forEach((d, i) => { if (d.wall === wall && type === 'open') out.push(`Door ${i + 1} (${Math.round(d.width)} cm)`) })
  project.windows.forEach((w, i) => { if (w.wall === wall) out.push(`Window ${i + 1} (${Math.round(w.width)} cm)`) })
  if (project.ac?.wall === wall) out.push('Air conditioner')
  return out
}
/** Keeps every door, window and the AC on their walls (preserving sizes) and
 *  checks they fit the wall type, the ceiling and do not intersect. Mutates
 *  `project`; returns an error message when no valid arrangement exists. */
export function fitOpenings(project: Project): string | null {
  const { room, doors, windows, ac } = project
  const len = (w: WallName) => wallFrame(w, project).length
  const type = (w: WallName) => project.walls?.[w]?.type ?? 'solid'
  const fit = (o: { wall: WallName; start: number; width: number }, label: string) => {
    const L = len(o.wall), lo = wallInset(project, o.wall === 'top' || o.wall === 'bottom' ? 'left' : 'top'), hi = wallInset(project, o.wall === 'top' || o.wall === 'bottom' ? 'right' : 'bottom')
    if (o.width > L - lo - hi) return `The ${label} (${Math.round(o.width)} cm) is wider than the ${o.wall} wall (${Math.round(L)} cm).`
    o.start = Math.max(lo, Math.min(L - hi - o.width, o.start))
    return null
  }
  for (const [i, d] of doors.entries()) {
    const label = doors.length > 1 ? `door ${i + 1}` : 'door'
    if (type(d.wall) === 'open') return `The ${label} is on the ${d.wall} side, which has no wall.`
    const e = fit(d, label); if (e) return e
    if (d.height > room.ceiling) return `The ${label} (${Math.round(d.height)} cm tall) is higher than the ${room.ceiling} cm ceiling.`
  }
  for (const [i, w] of windows.entries()) {
    const label = windows.length > 1 ? `window ${i + 1}` : 'window'
    if (type(w.wall) !== 'solid') return `The ${label} is on the ${w.wall} side, which is ${type(w.wall) === 'glass' ? 'already a glass wall' : 'open'}.`
    const e = fit(w, label); if (e) return e
    if (w.sill + w.height > room.ceiling) return `The ${label} top (${Math.round(w.sill + w.height)} cm) is above the ${room.ceiling} cm ceiling.`
  }
  if (ac) {
    if (type(ac.wall) !== 'solid') return `The AC unit needs a solid wall (the ${ac.wall} side is ${type(ac.wall)}).`
    const e = fit(ac, 'AC unit'); if (e) return e
    if (ac.mount + ac.height > room.ceiling) return `The AC unit top (${Math.round(ac.mount + ac.height)} cm) is above the ${room.ceiling} cm ceiling.`
  }
  const along = (a: { start: number; width: number }, b: { start: number; width: number }) => a.start < b.start + b.width && b.start < a.start + a.width
  for (let i = 0; i < doors.length; i++) for (let j = i + 1; j < doors.length; j++) if (doors[i].wall === doors[j].wall && along(doors[i], doors[j])) return `Door ${i + 1} and door ${j + 1} overlap on the ${doors[i].wall} wall.`
  for (const [wi, win] of windows.entries()) {
    for (const door of doors) if (door.wall === win.wall && along(door, win)) {
      // Try sliding the window clear of the door on the same wall.
      const L = len(win.wall), m = WALL_INSET
      const options = [door.start - win.width - 5, door.start + door.width + 5].filter(s => s >= m && s + win.width <= L - m)
      if (!options.length) return `Window ${wi + 1} overlaps a door on the ${win.wall} wall and there is no room to separate them.`
      win.start = options.sort((a, b) => Math.abs(a - win.start) - Math.abs(b - win.start))[0]
    }
    for (const [wj, other] of windows.entries()) if (wj > wi && other.wall === win.wall && along(other, win)) return `Window ${wi + 1} and window ${wj + 1} overlap on the ${win.wall} wall.`
  }
  const vertical = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1
  if (ac) {
    if (windows.some(win => ac.wall === win.wall && along(ac, win) && vertical(ac.mount, ac.mount + ac.height, win.sill, win.sill + win.height))) return 'The AC unit overlaps a window.'
    if (doors.some(door => ac.wall === door.wall && along(ac, door) && ac.mount < door.height)) return 'The AC unit overlaps a door opening.'
  }
  return null
}
/** Applies new room dimensions to every layout. Items keep their size and
 *  position where possible and are otherwise moved to the nearest valid spot. */
export function resizeRoom(project: Project, room: { width: number; depth: number; ceiling: number }):
  { project: Project; moved: number; overlapping: string[] } | { error: string } {
  const next: Project = clone(project)
  next.room = { ...room }
  const openingError = fitOpenings(next)
  if (openingError) return { error: openingError }
  let moved = 0
  const overlapping: string[] = []
  for (const layout of next.layouts) {
    const placed: Furniture[] = []
    // Grouped sofa sections move as one rigid footprint.
    const groups = new Map<string, Furniture[]>()
    for (const f of layout.furniture) if (f.grouped && f.groupId) groups.set(f.groupId, [...(groups.get(f.groupId) ?? []), f])
    for (const [, members] of groups) {
      const bs = members.map(bounds), r = interior(next)
      const u = { minX: Math.min(...bs.map(b => b.minX)), maxX: Math.max(...bs.map(b => b.maxX)), minY: Math.min(...bs.map(b => b.minY)), maxY: Math.max(...bs.map(b => b.maxY)) }
      if (u.maxX - u.minX > r.right - r.left + .001 || u.maxY - u.minY > r.bottom - r.top + .001) return { error: `The ${Math.round(u.maxX - u.minX)} × ${Math.round(u.maxY - u.minY)} cm sofa in “${layout.name}” cannot fit in a ${room.width} × ${room.depth} cm room.` }
      const dx = u.minX < r.left ? r.left - u.minX : u.maxX > r.right ? r.right - u.maxX : 0
      const dy = u.minY < r.top ? r.top - u.minY : u.maxY > r.bottom ? r.bottom - u.maxY : 0
      if (dx || dy) moved += members.length
      placed.push(...members.map(f => ({ ...f, x: f.x + dx, y: f.y + dy })))
    }
    const ordered = [...layout.furniture].filter(f => !(f.grouped && f.groupId)).sort((a, b) => Number(isSolid(b)) - Number(isSolid(a)) || Number(!!a.supportId) - Number(!!b.supportId))
    for (const item of ordered) {
      if (item.height > room.ceiling) return { error: `${item.name} in “${layout.name}” is ${Math.round(item.height)} cm tall — higher than the ${room.ceiling} cm ceiling.` }
      const beforeSupport=item.supportId?layout.furniture.find(f=>f.id===item.supportId):undefined
      const afterSupport=item.supportId?placed.find(f=>f.id===item.supportId):undefined
      if (afterSupport && item.height + afterSupport.height > room.ceiling) return { error: `${item.name} on ${afterSupport.name} would exceed the ${room.ceiling} cm ceiling.` }
      const attached=beforeSupport&&afterSupport?followSupport(item,beforeSupport,afterSupport):undefined
      const candidate=attached&&canSupport(attached,afterSupport!)&&inside(attached,next)?attached:{...item,supportId:undefined}
      const res=attached&&candidate===attached?{item:attached,free:!collides(attached,placed)}:isSolid(candidate)?placeNear(candidate,placed,next):(()=>{const c=clampInside(candidate,next);return c?{item:c,free:true}:null})()
      if (!res) return { error: `${item.name} in “${layout.name}” (${Math.round(item.width)} × ${Math.round(item.depth)} cm) cannot fit in a ${room.width} × ${room.depth} cm room.` }
      if (Math.abs(res.item.x - item.x) > .01 || Math.abs(res.item.y - item.y) > .01) moved++
      if (!res.free && !collides(item, layout.furniture)) overlapping.push(`${item.name} (${layout.name})`)
      placed.push(res.item)
    }
    layout.furniture = layout.furniture.map(f => placed.find(p => p.id === f.id)!)
  }
  return { project: next, moved, overlapping }
}
