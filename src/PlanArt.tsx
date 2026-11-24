import type { ReactNode } from 'react'
import { floorPresets, isMirrorKind, type Appearance, type Furniture, type Outdoor, type Project, type WallName } from './model'
import { doorGeometry, exterior, isLShape, lArm, lOutline, wallFrame, wallInset, wallPoint, wallThickness } from './geometry'
import { deskAccessories, lWardrobeLayout, mirrorOutline, type MirrorKind } from './parts'
import { hvOf } from './sofa'
import { isLux, luxCornerOutline, luxOf, luxRunLayout } from './wardrobe'
import { floorDataUrl, GROUND_CM, groundDataUrl, TILE_CM } from './textures'

export function tint(hex: string, factor: number) {
  const n=parseInt(hex.replace('#',''),16)
  if (!Number.isFinite(n)) return hex
  return '#'+[16,8,0].map(shift=>Math.round(Math.min(255,((n>>shift)&255)*factor)).toString(16).padStart(2,'0')).join('')
}
const WALLS: WallName[] = ['top','right','bottom','left']

/** Pattern definitions used by the plan (floor texture, grid, rug weave). */
export function PlanDefs({ appearance, prefix = 'p', outdoor }: { appearance: Appearance; prefix?: string; outdoor?: Outdoor }) {
  const floor = appearance.floor, kind = floorPresets[floor.material].kind
  const rotate = kind === 'wood' && floor.direction === 'vertical'
  return <defs>
    <pattern id={`${prefix}-grid`} width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#5d665f" strokeOpacity=".16" strokeWidth=".6" /></pattern>
    <pattern id={`${prefix}-floor`} width={TILE_CM} height={TILE_CM} patternUnits="userSpaceOnUse" patternTransform={rotate ? 'rotate(90)' : undefined}>
      <image href={floorDataUrl(floor.material, floor.baseColor)} width={TILE_CM} height={TILE_CM} preserveAspectRatio="none" />
    </pattern>
    {outdoor && outdoor.ground !== 'none' && <pattern id={`${prefix}-ground`} width={GROUND_CM} height={GROUND_CM} patternUnits="userSpaceOnUse">
      <image href={groundDataUrl(outdoor.ground, outdoor.color)} width={GROUND_CM} height={GROUND_CM} preserveAspectRatio="none" />
    </pattern>}
    <linearGradient id={`${prefix}-mirror`} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#dfecef"/><stop offset=".45" stopColor="#f8fcfd"/><stop offset=".55" stopColor="#c9dde3"/><stop offset="1" stopColor="#e6f0f2"/></linearGradient>
    <pattern id={`${prefix}-cane`} width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 3H6M3 0V6M0 0L6 6M6 0L0 6" stroke="#6e5638" strokeWidth=".55" strokeOpacity=".55"/></pattern>
    <pattern id={`${prefix}-weave`} width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0H4M0 2H4" stroke="#000" strokeOpacity=".05" strokeWidth=".7"/><path d="M1 0V4" stroke="#fff" strokeOpacity=".09" strokeWidth=".7"/></pattern>
  </defs>
}

/** Floor, grid, walls with openings, and architectural annotations. `k` is the
 *  number of plan units per screen pixel, so annotation text stays readable. */
const FRAME_COLORS = { none: '#9fc3d0', black: '#2e3134', white: '#f4f4f2', aluminum: '#a9adb1' }
/** Floor, outdoor ground, grid, walls (solid / glass / open) with every door and
 *  window, and architectural annotations. `k` is plan units per screen pixel. */
export function RoomShell({ project, appearance, showGrid, showMeasurements, k = 1, prefix = 'p', onBackgroundDown, openDoors }:
  { project: Project; appearance: Appearance; showGrid: boolean; showMeasurements: boolean; k?: number; prefix?: string; onBackgroundDown?: (e: React.PointerEvent<SVGRectElement>) => void; openDoors?: Record<string, boolean> }) {
  const { width: W, depth: D } = project.room
  const { doors, windows, ac } = project
  const ext = exterior(project)
  const adj = (wall: WallName): [WallName, WallName] => wall === 'top' || wall === 'bottom' ? ['left', 'right'] : ['top', 'bottom']
  const walls: ReactNode[] = []
  for (const wall of WALLS) {
    const spec = project.walls[wall], L = wallFrame(wall, project).length
    if (spec.type === 'open') {
      const p1 = wallPoint(wall, project, 0), p2 = wallPoint(wall, project, L)
      walls.push(<line key={wall} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#8d998f" strokeWidth={1} strokeDasharray={`${6 * k} ${5 * k}`} />)
      continue
    }
    const T = wallThickness(project, wall), I = T / 2
    const cuts = doors.filter(d => d.wall === wall).sort((x, y) => x.start - y.start)
    const segs: [number, number][] = []; let cur = 0
    for (const d of cuts) { segs.push([cur, d.start]); cur = d.start + d.width }
    segs.push([cur, L])
    const [ja, jb] = adj(wall)
    segs.filter(([a0, b0]) => b0 - a0 > .1).forEach(([a0, b0], i) => {
      const a2 = a0 === 0 ? -wallInset(project, ja) : a0, b2 = b0 === L ? L + wallInset(project, jb) : b0
      const p1 = wallPoint(wall, project, a2), p2 = wallPoint(wall, project, b2)
      const i1 = wallPoint(wall, project, a2, I), i2 = wallPoint(wall, project, b2, I)
      const o1 = wallPoint(wall, project, a2, -I), o2 = wallPoint(wall, project, b2, -I)
      if (spec.type === 'glass') {
        const fc = FRAME_COLORS[spec.frame]
        const mull = spec.frame === 'none' ? [] : Array.from({ length: Math.max(0, Math.floor((b0 - a0) / 120)) }, (_, m) => a0 + (m + 1) * (b0 - a0) / (Math.floor((b0 - a0) / 120) + 1))
        walls.push(<g key={`${wall}${i}`}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#e2f1f6" strokeOpacity=".9" strokeWidth={T} />
          <line x1={i1.x} y1={i1.y} x2={i2.x} y2={i2.y} stroke="#6da2b7" strokeWidth={.9} />
          <line x1={o1.x} y1={o1.y} x2={o2.x} y2={o2.y} stroke="#6da2b7" strokeWidth={.9} />
          {mull.map(m => { const q1 = wallPoint(wall, project, m, -I), q2 = wallPoint(wall, project, m, I); return <line key={m} x1={q1.x} y1={q1.y} x2={q2.x} y2={q2.y} stroke={fc} strokeWidth={2} /> })}
        </g>)
        return
      }
      walls.push(<g key={`${wall}${i}`}>
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={appearance.walls[wall]} strokeWidth={T} />
        <line x1={i1.x} y1={i1.y} x2={i2.x} y2={i2.y} stroke="#46534b" strokeOpacity=".55" strokeWidth={1} />
        <line x1={o1.x} y1={o1.y} x2={o2.x} y2={o2.y} stroke="#46534b" strokeOpacity=".55" strokeWidth={1} />
        {a0 > 0 && <line x1={o1.x} y1={o1.y} x2={i1.x} y2={i1.y} stroke="#46534b" strokeOpacity=".55" strokeWidth={1} />}
        {b0 < L && <line x1={o2.x} y1={o2.y} x2={i2.x} y2={i2.y} stroke="#46534b" strokeOpacity=".55" strokeWidth={1} />}
      </g>)
    })
  }
  const fs = 11 * k
  const label = (wall: WallName, along: number, out: number, text: string, color: string, weight = 600) => {
    const pt = wallPoint(wall, project, along, -out)
    const vertical = wall === 'left' || wall === 'right'
    return <text key={`${wall}${along}${text}`} x={pt.x} y={pt.y} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight={weight} fill={color} transform={vertical ? `rotate(-90 ${pt.x} ${pt.y})` : undefined}>{text}</text>
  }
  const doorArt = doors.map(d => {
    const open = openDoors?.[d.id] ?? true, T = wallThickness(project, d.wall)
    if (d.kind === 'sliding') {
      const half = d.width / 2 + 3, off = T / 4, toStart = d.hinge === 'start'
      const aStart = toStart ? d.start : d.start + d.width - half
      const pA = [wallPoint(d.wall, project, aStart, -off), wallPoint(d.wall, project, aStart + half, -off)]
      const bStart = open === toStart ? d.start + 2 : d.start + d.width - half
      const pB = [wallPoint(d.wall, project, bStart, off), wallPoint(d.wall, project, bStart + half, off)]
      return <g key={d.id}>
        <line x1={pA[0].x} y1={pA[0].y} x2={pA[1].x} y2={pA[1].y} stroke="#5d8fa3" strokeWidth={3} />
        <line x1={pB[0].x} y1={pB[0].y} x2={pB[1].x} y2={pB[1].y} stroke="#5d8fa3" strokeWidth={3} />
      </g>
    }
    const g = doorGeometry(project, d)
    const cross = (g.free.x - g.hinge.x) * (g.leafTip.y - g.hinge.y) - (g.free.y - g.hinge.y) * (g.leafTip.x - g.hinge.x)
    const leaf = d.kind === 'glass' ? '#5d8fa3' : '#8f765e'
    return <g key={d.id}>
      {open
        ? <line x1={g.hinge.x} y1={g.hinge.y} x2={g.leafTip.x} y2={g.leafTip.y} stroke={leaf} strokeWidth={2.5} strokeLinecap="round" />
        : <line x1={g.hinge.x} y1={g.hinge.y} x2={g.free.x} y2={g.free.y} stroke={leaf} strokeWidth={3.5} strokeLinecap="butt" />}
      <path d={`M ${g.free.x} ${g.free.y} A ${d.width} ${d.width} 0 0 ${cross > 0 ? 1 : 0} ${g.leafTip.x} ${g.leafTip.y}`} fill="none" stroke="#b39a80" strokeOpacity={open ? 1 : .55} strokeWidth={1.1} strokeDasharray="4 4" />
    </g>
  })
  const windowArt = windows.map(win => {
    const T = wallThickness(project, win.wall)
    const A = wallPoint(win.wall, project, win.start), B = wallPoint(win.wall, project, win.start + win.width)
    const A1 = wallPoint(win.wall, project, win.start, -1.6), B1 = wallPoint(win.wall, project, win.start + win.width, -1.6)
    const A2 = wallPoint(win.wall, project, win.start, 1.6), B2 = wallPoint(win.wall, project, win.start + win.width, 1.6)
    return <g key={win.id}>
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#e4f1f6" strokeWidth={T} />
      <line x1={A1.x} y1={A1.y} x2={B1.x} y2={B1.y} stroke="#6da2b7" strokeWidth={1} />
      <line x1={A2.x} y1={A2.y} x2={B2.x} y2={B2.y} stroke="#6da2b7" strokeWidth={1} />
    </g>
  })
  let acArt: ReactNode = null
  if (ac) {
    const I = wallInset(project, ac.wall)
    const pts = [[0, I], [ac.width, I], [ac.width, I + 22], [0, I + 22]].map(([a0, n]) => wallPoint(ac.wall, project, ac.start + a0, n))
    const mid = wallPoint(ac.wall, project, ac.start + ac.width / 2, I + 11)
    acArt = <><polygon points={pts.map(q => `${q.x},${q.y}`).join(' ')} fill="#f1f1ec" fillOpacity=".7" stroke="#8fa39e" strokeWidth={.9} strokeDasharray="3 2" />
      <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(fs, 9)} fontWeight={700} fill="#6e807a">AC</text></>
  }
  const dimOff = 40 * k + (ext ? 0 : 0)
  const bigW = Math.max(W, ext ? ext.right - ext.left : 0) * 4, bigD = Math.max(D, ext ? ext.bottom - ext.top : 0) * 4
  return <>
    <rect x={-bigW} y={-bigD} width={bigW * 2 + W} height={bigD * 2 + D} fill="transparent" className="plan-background" onPointerDown={onBackgroundDown} />
    {ext && <rect x={ext.left} y={ext.top} width={ext.right - ext.left} height={ext.bottom - ext.top} fill={`url(#${prefix}-ground)`} className="plan-background" onPointerDown={onBackgroundDown} />}
    <rect x="0" y="0" width={W} height={D} fill={`url(#${prefix}-floor)`} className="plan-background" onPointerDown={onBackgroundDown} />
    {showGrid && <rect width={W} height={D} fill={`url(#${prefix}-grid)`} pointerEvents="none" />}
    <g pointerEvents="none">
      {walls}
      {windowArt}
      {doorArt}
      {acArt}
      {showMeasurements && <>
        {doors.map(d => label(d.wall, d.start + d.width / 2, 14 * k, d.kind === 'sliding' ? `${Math.round(d.width)} cm sliding door` : `${Math.round(d.width)} cm ${d.kind === 'glass' ? 'glass ' : ''}door`, d.kind === 'hinged' ? '#8f765e' : '#4e8da5'))}
        {windows.map(w => label(w.wall, w.start + w.width / 2, 14 * k, 'Window', '#4e8da5'))}
        <g stroke="#9aa59d" strokeWidth={k}>
          <line x1={0} y1={-dimOff} x2={W} y2={-dimOff} /><line x1={0} y1={-dimOff - 5 * k} x2={0} y2={-dimOff + 5 * k} /><line x1={W} y1={-dimOff - 5 * k} x2={W} y2={-dimOff + 5 * k} />
          <line x1={-dimOff} y1={0} x2={-dimOff} y2={D} /><line x1={-dimOff - 5 * k} y1={0} x2={-dimOff + 5 * k} y2={0} /><line x1={-dimOff - 5 * k} y1={D} x2={-dimOff + 5 * k} y2={D} />
        </g>
        <text x={W / 2} y={-dimOff - 8 * k} textAnchor="middle" fontSize={12 * k} fontWeight={700} fill="#5f6b63">{Math.round(W)} cm</text>
        <text x={-dimOff - 8 * k} y={D / 2} textAnchor="middle" fontSize={12 * k} fontWeight={700} fill="#5f6b63" transform={`rotate(-90 ${-dimOff - 8 * k} ${D / 2})`}>{Math.round(D)} cm</text>
      </>}
    </g>
  </>
}

const OUTLINE = '#4a4f49'
/** Top view of an L-shaped corner wardrobe: the true L outline, a door strip
 *  along both inner fronts divided per door, handles, open shelving and the
 *  mirror panel (pale blue, labelled). */
function LWardrobePlan({ item, invalid }: { item: Furniture; invalid: boolean }) {
  const w = item.width, d = item.depth, t = lArm(item), mirror = item.kind === 'wardrobe-l-mirror'
  const wood = item.accent ?? '#9a7552', band = Math.min(4, t * .1)
  const pts = lOutline(item).map(p => `${p.x},${p.y}`).join(' ')
  const lay = lWardrobeLayout(w, d, t, mirror)
  const by = -d / 2 + t, sx = -w / 2 + t // inner front lines
  const handles = (doors: { a: number; b: number }[]) => doors.flatMap((dr, i) => i % 2 === 0 && doors[i + 1] ? [dr.b - 3, dr.b + 3] : i % 2 === 0 ? [dr.a + 4] : [])
  return <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
    <polygon points={pts} fill={item.color} stroke={invalid ? '#d0634b' : wood} strokeOpacity={invalid ? .9 : .85} strokeWidth={invalid ? 1.6 : 1.2} strokeLinejoin="round" />
    <line x1={-w / 2 + 2} y1={-d / 2 + 2} x2={sx - 1} y2={by - 1} stroke={wood} strokeOpacity=".35" strokeWidth=".8" strokeDasharray="3 3" />
    {lay.back.shelf && <g>
      <rect x={lay.back.shelf.a} y={-d / 2 + 1.5} width={lay.back.shelf.b - lay.back.shelf.a - 1.5} height={t - 1.5} fill={tint(item.color, .86)} stroke={wood} strokeOpacity=".6" strokeWidth=".7" />
      {[.3, .55, .8].map(q => <line key={q} x1={lay.back.shelf!.a + 3} x2={lay.back.shelf!.b - 4} y1={-d / 2 + t * q} y2={-d / 2 + t * q} stroke={wood} strokeOpacity=".55" strokeWidth=".8" />)}
    </g>}
    {lay.back.doors.map((dr, i) => <rect key={`b${i}`} x={dr.a + .4} y={by - band} width={dr.b - dr.a - .8} height={band} fill={dr.mirror ? '#cfe3ea' : tint(item.color, .93)} stroke={dr.mirror ? '#6f9aaa' : wood} strokeOpacity=".75" strokeWidth=".6" />)}
    {lay.side.doors.map((dr, i) => <rect key={`s${i}`} x={sx - band} y={dr.a + .4} width={band} height={dr.b - dr.a - .8} fill={tint(item.color, .93)} stroke={wood} strokeOpacity=".75" strokeWidth=".6" />)}
    {handles(lay.back.doors).map((x, i) => <line key={`hb${i}`} x1={x} x2={x} y1={by + 1} y2={by + 3.5} stroke="#2e2a26" strokeWidth="1.3" strokeLinecap="round" />)}
    {handles(lay.side.doors).map((y, i) => <line key={`hs${i}`} y1={y} y2={y} x1={sx + 1} x2={sx + 3.5} stroke="#2e2a26" strokeWidth="1.3" strokeLinecap="round" />)}
    {mirror && lay.back.doors.filter(dr => dr.mirror).map(dr => <g key="m">
      <rect x={dr.a + 2} y={-d / 2 + 3} width={dr.b - dr.a - 4} height={t - band - 5} rx="2" fill="#dcebf0" stroke="#8fb3c0" strokeWidth=".7" opacity=".9" />
      <path d={`M${dr.a + 6} ${by - band - 4} L${dr.a + 14} ${-d / 2 + 6} M${dr.a + 12} ${by - band - 4} L${dr.a + 20} ${-d / 2 + 6}`} stroke="#ffffff" strokeWidth="1.2" opacity=".9" />
      <text x={(dr.a + dr.b) / 2} y={-d / 2 + (t - band) / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(7, (dr.b - dr.a) / 5.5)} fontWeight={700} letterSpacing=".6" fill="#4f7d8d">MIRROR</text>
    </g>)}
  </g>
}

/** Luxury modular wardrobe section, top view. */
function LuxPlan({ item, invalid }: { item: Furniture; invalid: boolean }) {
  const walnut = item.accent ?? '#5e4433', stroke = invalid ? '#d0634b' : walnut, sw = invalid ? 1.6 : 1.3
  const tr = `translate(${item.x} ${item.y}) rotate(${item.rotation})`
  if (luxOf(item).part === 'corner') {
    const o = luxCornerOutline(item), mx = (o.mirror.a.x + o.mirror.b.x) / 2, my = (o.mirror.a.y + o.mirror.b.y) / 2
    const len = Math.hypot(o.mirror.a.x - o.mirror.b.x, o.mirror.a.y - o.mirror.b.y)
    return <g transform={tr}>
      <polygon points={o.pts.map(p => `${p.x},${p.y}`).join(' ')} fill={tint(walnut, 1.75)} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      <line x1={o.mirror.a.x - 2} y1={o.mirror.a.y + 1} x2={o.mirror.b.x + 1} y2={o.mirror.b.y - 2} stroke="#9cc7d4" strokeWidth="4.5" strokeLinecap="round" />
      <line x1={o.mirror.a.x - 4} y1={o.mirror.a.y + 1} x2={o.mirror.b.x + 1} y2={o.mirror.b.y - 4} stroke="#ffffff" strokeWidth="1" opacity=".8" />
      {len > 30 && <text transform={`translate(${mx - 9} ${my - 9}) rotate(-45)`} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(7, len / 7)} fontWeight={700} letterSpacing=".6" fill="#4f7d8d">MIRROR</text>}
    </g>
  }
  const w = item.width, d = item.depth, lay = luxRunLayout(item), band = Math.min(4, d * .08), fy = d / 2
  const handles = lay.doors.flatMap((dr, i) => i % 2 === 0 && lay.doors[i + 1] ? [dr.b - 3, dr.b + 3] : i % 2 === 0 ? [dr.a + 4] : [])
  return <g transform={tr}>
    <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={tint(item.color, .97)} stroke={stroke} strokeWidth={sw} />
    <rect x={-w / 2 + 1.5} y={-d / 2 + 1.5} width={w - 3} height={d - 3} fill="none" stroke={walnut} strokeOpacity=".35" strokeWidth=".8" />
    {lay.col && <g>
      <rect x={lay.col.a} y={-d / 2 + 2} width={lay.col.b - lay.col.a} height={d - band - 3} fill={tint(walnut, 1.6)} stroke={walnut} strokeOpacity=".6" strokeWidth=".7" />
      {[.3, .55].map(q => <line key={q} x1={lay.col!.a + 3} x2={lay.col!.b - 3} y1={-d / 2 + d * q} y2={-d / 2 + d * q} stroke={walnut} strokeOpacity=".5" strokeWidth=".8" />)}
      <line x1={lay.col.a + 3} x2={lay.col.b - 3} y1={fy - band - 2.5} y2={fy - band - 2.5} stroke="#f2c46f" strokeWidth="1.6" strokeLinecap="round" />
    </g>}
    {lay.doors.map((dr, i) => <rect key={i} x={dr.a + .4} y={fy - band} width={dr.b - dr.a - .8} height={band} fill={tint(item.color, .9)} stroke={walnut} strokeOpacity=".7" strokeWidth=".6" />)}
    {handles.map((x, i) => <line key={`h${i}`} x1={x} x2={x} y1={fy + 1} y2={fy + 3.5} stroke="#1f1c19" strokeWidth="1.3" strokeLinecap="round" />)}
  </g>
}

export function FurnitureArt({ item, invalid = false, prefix = 'p' }: { item: Furniture; invalid?: boolean; prefix?: string }) {
  if (isLux(item)) return <LuxPlan item={item} invalid={invalid} />
  if (isLShape(item)) return <LWardrobePlan item={item} invalid={invalid} />
  const { width: w, depth: d } = item
  const stroke = invalid ? '#d0634b' : OUTLINE, so = invalid ? .9 : .35, sw = invalid ? 1.6 : 1
  const body = <rect x={-w/2} y={-d/2} width={w} height={d} rx={Math.min(5,w/10,d/10)} fill={item.color} stroke={stroke} strokeOpacity={so} strokeWidth={sw} />
  let detail: ReactNode = null
  switch (item.kind) {
    case 'rug': {
      const circle = item.rugShape === 'circle'
      const ring = (inset: number, extra: object) => circle ? <ellipse rx={w/2-inset} ry={d/2-inset} {...extra}/> : <rect x={-w/2+inset} y={-d/2+inset} width={w-inset*2} height={d-inset*2} rx={Math.max(1,4-inset/3)} {...extra}/>
      return <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
        {ring(0, { fill: item.color, stroke: invalid ? '#d0634b' : tint(item.color, .8), strokeWidth: invalid ? 1.6 : .8 })}
        {ring(0, { fill: `url(#${prefix}-weave)` })}
        {ring(Math.min(9, w*.06), { fill: 'none', stroke: tint(item.color, .86), strokeWidth: 1.4, strokeOpacity: .7 })}
        {!circle && [-1,1].map(s => <path key={s} d={Array.from({ length: Math.max(2, Math.floor(w / 6)) }, (_, i) => { const x = -w/2 + 3 + i * (w - 6) / Math.max(1, Math.floor(w / 6) - 1); return `M${x} ${s*d/2} v${s*3}` }).join('')} stroke={tint(item.color, .85)} strokeWidth=".8" />)}
      </g>
    }
    case 'bed': detail = <>
      <rect x={-w/2+6} y={-d/2+6} width={w-12} height={d-12} rx="5" fill="#f6f2eb" stroke="#c9beb1" strokeWidth=".8" />
      <rect x={-w/2+6} y={-d/2+d*.34} width={w-12} height={d*.66-6} rx="4" fill="#e3dbd0" />
      <path d={`M ${-w/2+6} ${-d/2+d*.34} h ${w-12}`} stroke="#cfc4b6" strokeWidth="1" />
      <rect x={-w/2+13} y={-d/2+13} width={(w-34)/2} height={Math.min(30,d*.17)} rx="6" fill="#fffdf9" stroke="#ddd4c8" strokeWidth=".7" />
      <rect x={4} y={-d/2+13} width={(w-34)/2} height={Math.min(30,d*.17)} rx="6" fill="#fffdf9" stroke="#ddd4c8" strokeWidth=".7" />
    </>; break
    case 'wardrobe': detail = <>
      <line x1="0" y1={-d/2+3} x2="0" y2={d/2-3} stroke="#5d5045" strokeOpacity=".55" strokeWidth="1" />
      <line x1={-6} y1={d/2-5} x2={-6} y2={d/2-12} stroke="#5d5045" strokeWidth="1.6" strokeLinecap="round" />
      <line x1={6} y1={d/2-5} x2={6} y2={d/2-12} stroke="#5d5045" strokeWidth="1.6" strokeLinecap="round" />
    </>; break
    case 'desk': {
      const acc = deskAccessories(w, d)
      detail = <>
        <rect x={-w/2+3} y={-d/2+3} width={w-6} height={d-6} rx="3" fill={tint(item.color,1.08)} opacity=".6" />
        {acc.monitor && <g>
          <rect x={acc.monitor.x-7} y={acc.monitor.y+1} width="14" height="7" rx="2" fill="#5b5f63" />
          <rect x={acc.monitor.x-acc.monitor.w/2} y={acc.monitor.y-3} width={acc.monitor.w} height="5" rx="2.2" fill="#2f3337" />
          <rect x={acc.monitor.x-acc.monitor.w/2+2} y={acc.monitor.y+.6} width={acc.monitor.w-4} height="1" rx=".5" fill="#8fb6d6" opacity=".7" />
        </g>}
        {acc.laptop && <g transform={`translate(${acc.laptop.x} ${acc.laptop.y})`}>
          <rect x={-acc.laptop.w/2} y={-acc.laptop.d/2-3} width={acc.laptop.w} height="3.5" rx="1.5" fill="#9aa0a6" />
          <rect x={-acc.laptop.w/2} y={-acc.laptop.d/2} width={acc.laptop.w} height={acc.laptop.d} rx="2.5" fill="#d9dcdf" stroke="#8b9096" strokeWidth=".6" />
          <rect x={-acc.laptop.w/2+3} y={-acc.laptop.d/2+3} width={acc.laptop.w-6} height={acc.laptop.d*.45} rx="1" fill="#c3c7cb" />
          <rect x={-5} y={acc.laptop.d/2-7} width="10" height="5" rx="1" fill="#c8ccd0" />
        </g>}
        {acc.pad && <g transform={`translate(${acc.pad.x} ${acc.pad.y})`}>
          <rect x={-acc.pad.w/2} y={-acc.pad.d/2} width={acc.pad.w} height={acc.pad.d} rx="3" fill="#3e4a52" opacity=".85" />
          <ellipse cx="2" cy="1" rx="3.3" ry="5" fill="#eef0f1" stroke="#9aa0a6" strokeWidth=".5" />
          <line x1="2" y1="-3.6" x2="2" y2="-1" stroke="#9aa0a6" strokeWidth=".5" />
        </g>}
      </>
    } break
    case 'gaming': {
      const accent = item.accent ?? item.color, r = Math.min(w, d) * .46
      return <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
        <g opacity=".5">{[0,1,2,3,4].map(i => { const a = i/5*Math.PI*2 - Math.PI/2; return <g key={i}><line x1="0" y1="0" x2={Math.cos(a)*r} y2={Math.sin(a)*r} stroke="#4a4d52" strokeWidth="3" strokeLinecap="round"/><circle cx={Math.cos(a)*r} cy={Math.sin(a)*r} r="2.6" fill="#2d2f33"/></g> })}</g>
        <rect x={-w*.29} y={-d*.14} width={w*.58} height={d*.56} rx={Math.min(w,d)*.12} fill={item.color} stroke={invalid?'#d0634b':OUTLINE} strokeOpacity={invalid?.9:.4} strokeWidth={invalid?1.6:1} />
        <rect x={-w*.2} y={-d*.08} width={w*.4} height={d*.44} rx={Math.min(w,d)*.08} fill={tint(item.color,1.12)} />
        <rect x={-w*.05} y={-d*.08} width={w*.1} height={d*.44} fill={accent} opacity=".9" />
        {[-1,1].map(s => <rect key={s} x={s>0?w*.3:-w*.4} y={-d*.06} width={w*.1} height={d*.36} rx="2.5" fill={tint(item.color,.85)} stroke={OUTLINE} strokeOpacity=".3" strokeWidth=".6" />)}
        <path d={`M ${-w*.34} ${-d*.16} Q ${-w*.36} ${-d*.47} 0 ${-d*.48} Q ${w*.36} ${-d*.47} ${w*.34} ${-d*.16} Z`} fill={item.color} stroke={invalid?'#d0634b':OUTLINE} strokeOpacity={invalid?.9:.4} strokeWidth={invalid?1.6:1} />
        {[-1,1].map(s => <path key={s} d={`M ${s*w*.2} ${-d*.17} Q ${s*w*.22} ${-d*.4} ${s*w*.08} ${-d*.44}`} fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />)}
      </g>
    }
    case 'haven': {
      // Cloud Haven section: plush rounded arms, a deep back cushion and a soft seat cushion.
      const hv = hvOf(item), A = Math.min(hv.arm, w * .4), B = Math.min(hv.back, d * .6)
      const x0 = -w/2 + (hv.armL ? A : 0), x1 = w/2 - (hv.armR ? A : 0), inset = 1.5
      const edge = invalid ? '#d0634b' : tint(item.color, .72), eo = invalid ? .9 : .7
      return <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
        <rect x={-w/2} y={-d/2} width={w} height={d} rx={Math.min(12, w/6, d/6)} fill={tint(item.color, .9)} stroke={edge} strokeOpacity={eo} strokeWidth={invalid ? 1.6 : .9} />
        <rect x={x0 + inset} y={-d/2 + inset} width={Math.max(1, x1 - x0 - inset*2)} height={B - inset} rx={Math.min(B*.45, 14)} fill={tint(item.color, .97)} stroke={tint(item.color, .8)} strokeOpacity=".6" strokeWidth=".7" />
        <rect x={x0 + inset} y={-d/2 + B + .5} width={Math.max(1, x1 - x0 - inset*2)} height={d - B - inset - .5} rx={Math.min(16, (x1-x0)/5)} fill={tint(item.color, 1.06)} stroke={tint(item.color, .82)} strokeOpacity=".55" strokeWidth=".7" />
        <rect x={x0 + inset + 6} y={-d/2 + B + 6} width={Math.max(1, x1 - x0 - inset*2 - 12)} height={Math.max(1, (d - B) * .38)} rx="10" fill="#fff" opacity=".12" />
        {hv.type === 'chaise' && <path d={`M ${x0 + 10} ${-d/2 + B + (d - B) * .48} h ${Math.max(0, x1 - x0 - 20)}`} stroke={tint(item.color, .8)} strokeOpacity=".35" strokeWidth=".7" strokeDasharray="3 3" />}
        {hv.armL && <rect x={-w/2 + inset} y={-d/2 + inset} width={A - inset} height={d - inset*2} rx={Math.min(A*.48, 12)} fill={tint(item.color, 1.0)} stroke={tint(item.color, .78)} strokeOpacity=".6" strokeWidth=".8" />}
        {hv.armR && <rect x={w/2 - A} y={-d/2 + inset} width={A - inset} height={d - inset*2} rx={Math.min(A*.48, 12)} fill={tint(item.color, 1.0)} stroke={tint(item.color, .78)} strokeOpacity=".6" strokeWidth=".8" />}
      </g>
    }
    case 'mirror-rect': case 'mirror-arch': case 'mirror-round': case 'mirror-oval': case 'mirror-wavy': case 'mirror-organic': case 'mirror-vanity': case 'mirror-floor': {
      // Plan symbol: the glass seen edge-on (silver-blue bar with frame ends);
      // freestanding mirrors add their stand, leaning mirrors their lean.
      const fc = item.frameless ? '#b9c7cc' : item.color, edge = invalid ? '#d0634b' : '#55636a'
      const glassD = Math.min(3, d), gy = item.mount === 'lean' ? -d/2 + 1.5 : item.mount === 'free' ? -glassD/2 : -d/2
      return <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
        {item.mount === 'free' && <rect x={-w/2 * .7} y={-d/2} width={w * .7} height={d} rx="4" fill="#d9d6cf" fillOpacity=".55" stroke={edge} strokeOpacity=".35" strokeWidth=".7" strokeDasharray="3 2" />}
        {item.mount === 'lean' && <path d={`M ${-w/2} ${-d/2 + 1} L ${-w/2} ${d/2} L ${w/2} ${d/2} L ${w/2} ${-d/2 + 1}`} fill="#cfe3ea" fillOpacity=".35" stroke={edge} strokeOpacity=".4" strokeWidth=".7" />}
        <rect x={-w/2} y={gy} width={w} height={glassD} rx="1" fill={`url(#${prefix}-mirror)`} stroke={edge} strokeOpacity=".6" strokeWidth=".6" />
        {!item.frameless && <><rect x={-w/2 - .5} y={gy - .5} width={3} height={glassD + 1} fill={fc} /><rect x={w/2 - 2.5} y={gy - .5} width={3} height={glassD + 1} fill={fc} /></>}
        {item.mount === 'lean' && <line x1={-w/2} y1={d/2} x2={w/2} y2={d/2} stroke={fc} strokeWidth="2.2" />}
      </g>
    }
    case 'tv-unit': {
      // Japandi cabinet: two cane-door compartments either side of open centre shelving; front = +y.
      const cane = item.accent ?? '#d8bd8c', side = w * .3
      detail = <>
        <rect x={-w/2 + 2} y={-d/2 + 2} width={w - 4} height={d - 4} rx="2" fill={tint(item.color, 1.06)} />
        {[-1, 1].map(sd => <g key={sd}>
          <rect x={sd < 0 ? -w/2 + 4 : w/2 - 4 - side} y={d/2 - 9} width={side} height={6} rx="1" fill={cane} stroke={tint(cane, .7)} strokeWidth=".5" />
          <path d={Array.from({ length: Math.floor(side / 4) }, (_, i) => `M ${(sd < 0 ? -w/2 + 4 : w/2 - 4 - side) + i * 4 + 2} ${d/2 - 9} l 2 6`).join(' ')} stroke={tint(cane, .7)} strokeWidth=".4" />
        </g>)}
        <rect x={-w/2 + 6 + side} y={-d/2 + 5} width={w - 12 - side * 2} height={d - 10} rx="1.5" fill={tint(item.color, .78)} opacity=".55" />
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => <circle key={i} cx={sx * (w/2 - 6)} cy={sy * (d/2 - 5)} r="1.8" fill={tint(item.color, .6)} />)}
        <path d={`M ${-6} ${d/2 + 2} L 0 ${d/2 + 5} L 6 ${d/2 + 2}`} fill="none" stroke={tint(item.color, .55)} strokeWidth=".8" />
      </>
    } break
    case 'tv-stand': {
      // The screen is edge-on in plan view; the two slim feet show its stand depth.
      detail = <>
        <rect x={-w/2+2} y={-d/2+2} width={w-4} height={Math.max(3,Math.min(7,d*.2))} rx="1.5" fill="#161d24" stroke="#7f939d" strokeWidth=".6" />
        <rect x={-w/2+5} y={-d/2+3} width={w-10} height="1.5" fill="#93b5c5" opacity=".75" />
        {[-1,1].map(s=><g key={s}><rect x={s*w*.32-2} y={-d*.28} width="4" height={d*.68} rx="1" fill="#343b40"/><path d={`M ${s*w*.32-9} ${d/2-2} h 18`} stroke="#20262a" strokeWidth="2.5" strokeLinecap="round"/></g>)}
      </>
    } break
    case 'monitor': detail = <><rect x={-w/2+2} y={-d/2+1} width={w-4} height="5" rx="1" fill="#122b3c" stroke="#718995" strokeWidth=".6"/><rect x="-2" y="-2" width="4" height="8" fill="#626a6e"/><rect x={-w*.17} y={d/2-3} width={w*.34} height="2" rx="1" fill="#464d50"/></>; break
    case 'vase': detail = <><ellipse rx={w*.42} ry={d*.42} fill={item.color} stroke="#907f70" strokeWidth=".8"/><ellipse rx={w*.18} ry={d*.18} fill="#a99a88"/></>; break
    case 'decor': detail = <><rect x={-w*.38} y={-d*.36} width={w*.76} height={d*.72} rx={Math.min(5,w*.2)} fill={item.color} stroke="#748174" strokeWidth=".7"/><path d={`M ${-w*.22} 0 H ${w*.22}`} stroke="#eef2ea" strokeWidth="1"/></>; break
    case 'rattan-table': {
      const cane = item.accent ?? '#d8bd8c', r = Math.min(w, d) * .22
      return <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
        <rect x={-w/2} y={-d/2} width={w} height={d} rx={r} fill={item.color} stroke={invalid ? '#d0634b' : OUTLINE} strokeOpacity={invalid ? .9 : .35} strokeWidth={invalid ? 1.6 : 1} />
        <rect x={-w/2 + 6} y={-d/2 + 6} width={w - 12} height={d - 12} rx={Math.max(2, r - 6)} fill={cane} opacity=".9" />
        <rect x={-w/2 + 6} y={-d/2 + 6} width={w - 12} height={d - 12} rx={Math.max(2, r - 6)} fill={`url(#${prefix}-cane)`} opacity=".55" />
      </g>
    }
    case 'lugo-chair': {
      // Curved beech arms either side of a rounded bouclé seat, backrest at the rear (-y).
      const wood = item.accent ?? '#d2b089', aw = Math.max(4, w * .09)
      return <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
        <rect x={-w/2 + aw} y={-d/2 + d * .2} width={w - aw * 2} height={d * .74} rx={w * .14} fill={item.color} stroke={invalid ? '#d0634b' : tint(item.color, .75)} strokeWidth={invalid ? 1.6 : .8} />
        <rect x={-w/2 + aw + 3} y={-d/2 + d * .26} width={w - aw * 2 - 6} height={d * .5} rx={w * .12} fill={tint(item.color, 1.05)} />
        <path d={`M ${-w/2 + aw} ${-d/2 + d * .24} Q 0 ${-d/2 - 2} ${w/2 - aw} ${-d/2 + d * .24} L ${w/2 - aw} ${-d/2 + d * .1} Q 0 ${-d/2 - 10} ${-w/2 + aw} ${-d/2 + d * .1} Z`} fill={tint(item.color, .93)} stroke={tint(item.color, .75)} strokeWidth=".7" />
        {[-1, 1].map(sd => <path key={sd} d={`M ${sd * (w/2 - aw/2)} ${-d/2 + d * .12} Q ${sd * (w/2 + 1)} ${0} ${sd * (w/2 - aw/2)} ${d/2 - 2}`} fill="none" stroke={wood} strokeWidth={aw} strokeLinecap="round" />)}
      </g>
    }
    case 'halo-table': {
      const r = Math.min(w, d) / 2, wood = item.color
      return <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
        <circle r={r} fill={wood} stroke={invalid ? '#d0634b' : OUTLINE} strokeOpacity={invalid ? .9 : .35} strokeWidth={invalid ? 1.6 : 1} />
        {[.78, .55, .32].map(k => <circle key={k} r={r * k} fill="none" stroke={tint(wood, .82)} strokeOpacity=".45" strokeWidth=".7" />)}
        <circle r={r * .1} fill={tint(wood, .86)} />
      </g>
    }
    case 'outdoor-sofa': case 'garden-chair': {
      const cushion = item.accent ?? '#e6e1d6', arm = Math.min(14, w * .14)
      detail = <>
        {[0, 1, 2, 3].map(i => <line key={i} x1={-w/2 + 3} x2={w/2 - 3} y1={-d/2 + (i + .5) * d / 4} y2={-d/2 + (i + .5) * d / 4} stroke={tint(item.color, .75)} strokeOpacity=".35" strokeWidth=".8" />)}
        <rect x={-w/2 + arm} y={-d/2 + d * .28} width={w - arm * 2} height={d * .66} rx="6" fill={cushion} stroke={tint(cushion, .8)} strokeWidth=".7" />
        <rect x={-w/2 + arm} y={-d/2 + 3} width={w - arm * 2} height={d * .24} rx="5" fill={tint(cushion, .94)} stroke={tint(cushion, .8)} strokeWidth=".7" />
        {item.kind === 'outdoor-sofa' && w > 120 && <line x1="0" x2="0" y1={-d/2 + d * .3} y2={d/2 - 4} stroke={tint(cushion, .78)} strokeWidth=".8" />}
      </>
    } break
    case 'outdoor-table': detail = <>
      {Array.from({ length: Math.max(3, Math.round(d / 12)) }, (_, i) => { const n = Math.max(3, Math.round(d / 12)); return <line key={i} x1={-w/2 + 3} x2={w/2 - 3} y1={-d/2 + (i + 1) * d / (n + 1)} y2={-d/2 + (i + 1) * d / (n + 1)} stroke={tint(item.color, .7)} strokeOpacity=".5" strokeWidth=".9" /> })}
    </>; break
    case 'lounger': {
      const frame = item.accent ?? '#9c7a58'
      return <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
        <rect x={-w/2} y={-d/2} width={w} height={d} rx="6" fill={frame} stroke={invalid ? '#d0634b' : OUTLINE} strokeOpacity={invalid ? .9 : .35} strokeWidth={invalid ? 1.6 : 1} />
        <rect x={-w/2 + 4} y={-d/2 + 4} width={w - 8} height={d * .3} rx="6" fill={tint(item.color, .95)} />
        <rect x={-w/2 + 4} y={-d/2 + d * .3 + 6} width={w - 8} height={d * .7 - 10} rx="6" fill={item.color} />
        <circle cx={-w/2 + 6} cy={d/2 - 8} r="4" fill="#3d3f42" /><circle cx={w/2 - 6} cy={d/2 - 8} r="4" fill="#3d3f42" />
      </g>
    }
    case 'planter': {
      const r = Math.min(w, d) / 2, pot = item.accent ?? '#8c8279'
      return <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
        <ellipse rx={w/2} ry={d/2} fill={pot} stroke={invalid ? '#d0634b' : OUTLINE} strokeOpacity={invalid ? .9 : .35} />
        {[0, 1, 2, 3, 4, 5, 6].map(i => { const a = i / 7 * Math.PI * 2; return <circle key={i} cx={Math.cos(a) * r * .45} cy={Math.sin(a) * r * .45} r={r * .42} fill={tint(item.color, .85 + (i % 3) * .12)} opacity=".92" /> })}
        <circle r={r * .35} fill={tint(item.color, 1.15)} />
      </g>
    }
    case 'shoe': {
      const s = Math.min(w*.32, d*.5) / 22
      detail = <>
        <rect x={-w/2+3} y={-d/2+3} width={w-6} height={d-9} rx="2" fill={tint(item.color,1.05)} />
        <rect x={-w/2+1.5} y={d/2-5} width={w/2-2} height="3.5" rx="1" fill={tint(item.color,.9)} />
        <rect x={.5} y={d/2-5} width={w/2-2} height="3.5" rx="1" fill={tint(item.color,.9)} />
        <circle cx={-4} cy={d/2-3.2} r=".9" fill="#5d5045" /><circle cx={4} cy={d/2-3.2} r=".9" fill="#5d5045" />
        <path transform={`translate(0 ${-3}) scale(${s})`} d="M-11 4 L-11 -1 Q-11 -4 -8 -4 L-5 -4 Q-3 -1 1 -1 Q8 -1 10 1.5 Q11.5 4 9 4 Z" fill={tint(item.color,.72)} opacity=".55" />
      </>
    } break
    case 'sofa': detail = <><rect x={-w/2+8} y={-d/2+15} width={w-16} height={d-20} rx="7" fill={tint(item.color,1.1)} /><line x1="0" y1={-d/2+18} x2="0" y2={d/2-8} stroke="#7d7f78" strokeOpacity=".5" /></>; break
    case 'chair': detail = <><rect x={-w*.36} y={-d*.3} width={w*.72} height={d*.66} rx="6" fill={tint(item.color,1.12)} /><rect x={-w*.42} y={-d/2+2} width={w*.84} height={d*.14} rx="3" fill={tint(item.color,.85)} /></>; break
    case 'dresser': case 'bedside': case 'shelf':
      detail = <>{[-.25,0,.25].map(i => <line key={i} x1={-w/2+6} x2={w/2-6} y1={i*d} y2={i*d} stroke="#6f5d4d" strokeOpacity=".45" strokeWidth="1" />)}</>; break
  }
  return <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>{body}{detail}</g>
}

/** Upright, size-aware name label drawn at the item's center. */
export function FurnitureLabel({ item, k = 1 }: { item: Furniture; k?: number }) {
  if (isLux(item)) { if (luxOf(item).part === 'corner') return null; item = { ...item, name: `Wardrobe · Side ${luxOf(item).side ?? 'A'}` } }
  if (item.kind === 'rug' || item.kind === 'haven' || item.supportId || item.kind === 'monitor' || item.kind === 'vase' || item.kind === 'decor' || isMirrorKind(item.kind)) return null
  const rot = ((item.rotation % 180) + 180) % 180
  const avail = rot < 10 || rot > 170 ? item.width : Math.abs(rot - 90) < 10 ? item.depth : Math.min(item.width, item.depth)
  const size = Math.min(12 * k, (avail - 6) / (item.name.length * .56))
  if (size < 7 * k) return null
  if (isLShape(item)) { // along the side arm (the back arm carries the mirror marking)
    const t = lArm(item), a = item.rotation * Math.PI / 180, lx = -item.width / 2 + t / 2, ly = t / 2
    const x = item.x + lx * Math.cos(a) - ly * Math.sin(a), y = item.y + lx * Math.sin(a) + ly * Math.cos(a)
    const s2 = Math.min(10 * k, t * .3, (item.depth - t - 10) / (item.name.length * .56))
    if (s2 < 5 * k) return null
    let ang = (((item.rotation + 90) % 360) + 360) % 360; if (ang > 90 && ang < 270) ang -= 180
    return <text transform={`rotate(${ang} ${x} ${y})`} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={s2} fontWeight={600} fill="#2f3b35" stroke="#fffdf8" strokeOpacity=".85" strokeWidth={s2 * .28} paintOrder="stroke" strokeLinejoin="round" pointerEvents="none">{item.name}</text>
  }
  return <text x={item.x} y={item.y} textAnchor="middle" dominantBaseline="middle" fontSize={size} fontWeight={600} fill="#2f3b35" stroke="#fffdf8" strokeOpacity=".85" strokeWidth={size * .28} paintOrder="stroke" strokeLinejoin="round" pointerEvents="none">{item.name}</text>
}

/** Small front-elevation preview used on library cards. */
export function LibraryPreview({ kind, color = '#26282b', accent }: { kind: string; color?: string; accent?: string }) {
  if (kind.startsWith('mirror-')) {
    const dims: Record<string, [number, number]> = { 'mirror-rect': [12, 30], 'mirror-arch': [14, 30], 'mirror-round': [26, 26], 'mirror-oval': [16, 30], 'mirror-wavy': [16, 30], 'mirror-organic': [20, 28], 'mirror-vanity': [28, 20], 'mirror-floor': [14, 30] }
    const [w, h] = dims[kind] ?? [16, 30]
    const pts = mirrorOutline(kind as MirrorKind, w, h, true, 48).map(([x, y]) => `${x + 16},${16 - y}`).join(' ')
    return <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden><defs><linearGradient id={`lp-${kind}`} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#eaf3f5"/><stop offset=".5" stopColor="#c7dbe1"/><stop offset="1" stopColor="#f3f8f9"/></linearGradient></defs>
      <polygon points={pts} fill={`url(#lp-${kind})`} stroke={kind === 'mirror-wavy' || kind === 'mirror-organic' ? '#9fb3b9' : color} strokeWidth="1.6" strokeLinejoin="round" />
      {kind === 'mirror-floor' && <line x1="6" y1="31" x2="26" y2="31" stroke="#9a9a96" strokeWidth="1" />}
    </svg>
  }
  const wood = color, cane = accent ?? '#d8bd8c'
  if (kind === 'wardrobe-lux') {
    const wal = accent ?? '#5e4433', door = color
    return <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
      <rect x="1.5" y="3" width="29" height="26" fill={wal} />
      <rect x="3" y="4.5" width="8" height="23" fill={door} /><rect x="11.6" y="5.5" width="4.4" height="22" fill="#cfe3ea" />
      <rect x="16.6" y="4.5" width="6.6" height="23" fill={door} /><rect x="23.8" y="4.5" width="5.2" height="6" fill={door} />
      <rect x="23.8" y="11" width="5.2" height="9" fill={tint(wal, 1.5)} />{[13.5, 16.8].map(y => <rect key={y} x="23.8" y={y} width="5.2" height=".7" fill="#f2c46f" />)}
      {[21, 23.3, 25.6].map(y => <rect key={y} x="23.8" y={y} width="5.2" height="1.9" fill={door} />)}
      <path d="M10.2 12 V21 M17.6 12 V21" stroke="#1f1c19" strokeWidth=".9" strokeLinecap="round" />
    </svg>
  }
  if (kind === 'wardrobe-l' || kind === 'wardrobe-l-mirror') {
    const edge = accent ?? '#9a7552', door = color
    return <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
      <path d="M3 4 H29 V28 H3 Z" fill={edge} />
      <path d="M4.2 5.2 H11 V26.8 H4.2 Z" fill={door} opacity=".82" />
      {[11.6, 17.4, 23.2].map(x => <rect key={x} x={x} y="5.2" width="5.2" height="21.6" fill={kind === 'wardrobe-l-mirror' && x === 17.4 ? '#cfe3ea' : door} />)}
      {kind === 'wardrobe-l' && <><rect x="23.2" y="5.2" width="5.2" height="21.6" fill={tint(edge, 1.3)} />{[10, 15, 20].map(y => <rect key={y} x="23.2" y={y} width="5.2" height=".9" fill={edge} />)}</>}
      {kind === 'wardrobe-l-mirror' && <path d="M18.4 10 L21 7 M18.4 14 L22 10" stroke="#fff" strokeWidth=".8" />}
      <path d="M16.9 13 V18 M22.7 13 V18" stroke="#2b2622" strokeWidth=".9" strokeLinecap="round" />
      <rect x="3" y="27" width="26" height="1.6" fill="#3b332b" />
    </svg>
  }
  switch (kind) {
    case 'tv-stand': return <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden><rect x="2" y="3" width="28" height="19" rx="1.5" fill="#202428" stroke="#626e73" strokeWidth=".8"/><rect x="4" y="5" width="24" height="15" rx=".5" fill="#172c3e"/><path d="M5 18 Q12 8 25 7" stroke="#6f9ab0" strokeOpacity=".65" fill="none"/><path d="M9 22 L7 29 M23 22 L25 29" stroke="#252b2e" strokeWidth="1.7" strokeLinecap="round"/></svg>
    case 'tv-unit': return <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden><rect x="2" y="10" width="28" height="12" rx="1.5" fill={wood}/><rect x="3.5" y="11.5" width="8" height="9" fill={cane}/><rect x="20.5" y="11.5" width="8" height="9" fill={cane}/><rect x="12.5" y="11.5" width="7" height="9" fill="#5a4330"/><line x1="12.5" y1="16" x2="19.5" y2="16" stroke={wood}/><path d="M5 22 L4 27 M27 22 L28 27" stroke={wood} strokeWidth="1.4" strokeLinecap="round"/></svg>
    case 'rattan-table': return <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden><rect x="2" y="11" width="28" height="3" rx="1.5" fill={wood}/><rect x="5" y="19" width="22" height="2.5" rx="1" fill={cane}/><path d="M5 14 V26 M27 14 V26" stroke={wood} strokeWidth="1.8" strokeLinecap="round"/></svg>
    case 'lugo-chair': return <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden><rect x="9" y="5" width="14" height="13" rx="6" fill={color}/><rect x="8" y="16" width="16" height="7" rx="3.5" fill={color}/><path d="M6 12 Q5 20 7 27 M26 12 Q27 20 25 27" stroke={accent ?? '#d2b089'} strokeWidth="2.2" fill="none" strokeLinecap="round"/></svg>
    case 'halo-table': return <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden><ellipse cx="16" cy="10" rx="12" ry="3.5" fill={wood}/><path d="M9 12 L6 28 M23 12 L26 28 M16 13 L16 28" stroke={wood} strokeWidth="2.2" strokeLinecap="round"/></svg>
  }
  return null
}
