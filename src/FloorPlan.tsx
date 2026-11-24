import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type WheelEvent } from 'react'
import { Copy, Ruler, RotateCw, Trash2 } from 'lucide-react'
import { activeLayout, type Furniture, type FurnitureKind, type Project } from './model'
import { bounds, clampInside, exterior, inside, interior, isCircular, mountNearest, snapToWalls, warnings, isLShape, lOutline } from './geometry'
import { ALL_INCLUDE, buildDims, DimensionLayer, type MeasureMode } from './measure'
import { FurnitureArt, FurnitureLabel, PlanDefs, RoomShell } from './PlanArt'
import { clampGroup, groupOf, isHaven, magnetSnap, resizeModule, translate, unionBounds } from './sofa'

type Props = {
  project: Project; furniture: Furniture[]; selectedId: string | null; showGrid: boolean; measureMode: MeasureMode; snap: boolean
  mobile: boolean; editMode: 'move' | 'resize'
  onSelect: (id: string | null) => void; onMove: (item: Furniture) => void; onMoveMany: (items: Furniture[]) => void; onCommit: () => void; onAdd: (kind: FurnitureKind, x: number, y: number) => void
  onRotate: () => void; onDuplicate: () => void; onDelete: () => void; onEditSize: () => void; openDoors?: Record<string, boolean>
}
type DragState =
  | { type: 'move'; id: string; dx: number; dy: number; committed: boolean }
  | { type: 'resize'; id: string; original: Furniture; sx: number; sy: number; anchor: { x: number; y: number }; committed: boolean }
const TB_W = 152, TB_H = 40
function rotate(x: number, y: number, angle: number) { const a = angle * Math.PI / 180; return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) } }

export default function FloorPlan(p: Props) {
  const wrap = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), roomGroup = useRef<SVGGElement>(null)
  const drag = useRef<DragState | null>(null), pan = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const [zoom, setZoom] = useState(1), [offset, setOffset] = useState({ x: 0, y: 0 })
  const [space, setSpace] = useState(false)
  // Touch: bigger handles/toolbar on coarse pointers, and two-finger pinch-zoom / pan.
  const coarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  const tbW = coarse ? 188 : TB_W, tbH = coarse ? 50 : TB_H
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number; anchor: { x: number; y: number } } | null>(null)
  const [dragging, setDragging] = useState<null | 'move' | 'resize'>(null)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const [overlay, setOverlay] = useState<{ scale: number; tb: { x: number; y: number } | null }>({ scale: 1, tb: null })
  const [, setTick] = useState(0)
  const W = p.project.room.width, D = p.project.room.depth
  // Frame the room plus any visible outdoor area.
  const ext = exterior(p.project)
  const vb = { l: Math.min(0, ext?.left ?? 0), t: Math.min(0, ext?.top ?? 0), r: Math.max(W, ext?.right ?? W), b: Math.max(D, ext?.bottom ?? D) }
  const PAD = Math.max(90, Math.max(vb.r - vb.l, vb.b - vb.t) * .12)
  const cx = (vb.l + vb.r) / 2, cy = (vb.t + vb.b) / 2
  const k = 1 / overlay.scale
  const appearance = activeLayout(p.project).appearance
  const selected = p.furniture.find(f => f.id === p.selectedId)
  const members = selected ? groupOf(selected, p.furniture) : []
  const isGroup = members.length > 1
  const [guides, setGuides] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([])

  // Re-fit when the room size changes.
  useEffect(() => { setZoom(1); setOffset({ x: 0, y: 0 }) }, [W, D, p.project.id])
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const ro = new ResizeObserver(() => setTick(t => t + 1)); ro.observe(el); return () => ro.disconnect()
  }, [])
  // Measure the rendered plan to place the HTML toolbar and keep handle sizes constant on screen.
  useLayoutEffect(() => {
    const g = roomGroup.current, w = wrap.current
    const m = g?.getScreenCTM()
    if (!g || !w || !m) return
    const wr = w.getBoundingClientRect()
    const scale = Math.hypot(m.a, m.b) || 1
    const toScreen = (x: number, y: number) => ({ x: m.a * x + m.c * y + m.e - wr.left, y: m.b * x + m.d * y + m.f - wr.top })
    const rectOf = (f: Furniture) => { const b = bounds(f); const a = toScreen(b.minX, b.minY), c = toScreen(b.maxX, b.maxY); return { l: a.x, t: a.y, r: c.x, b: c.y } }
    let tb: { x: number; y: number } | null = null
    if (!p.mobile && selected && !dragging) {
      const u = unionBounds(members.length ? members : [selected]), ua = toScreen(u.minX, u.minY), ub = toScreen(u.maxX, u.maxY)
      const s = { l: ua.x, t: ua.y, r: ub.x, b: ub.y }, mx = (s.l + s.r) / 2, my = (s.t + s.b) / 2, gap = 12
      const others = p.furniture.filter(f => !members.some(m => m.id === f.id) && f.kind !== 'rug').map(rectOf)
      const clampX = (x: number) => Math.max(8, Math.min(wr.width - tbW - 8, x))
      const clampY = (y: number) => Math.max(8, Math.min(wr.height - tbH - 8, y))
      const cands = [
        { x: clampX(mx - tbW / 2), y: s.t - gap - tbH },
        { x: clampX(mx - tbW / 2), y: s.b + gap },
        { x: s.r + gap, y: clampY(my - tbH / 2) },
        { x: s.l - gap - tbW, y: clampY(my - tbH / 2) },
      ]
      const visible = (c: { x: number; y: number }) => c.x >= 4 && c.y >= 4 && c.x + tbW <= wr.width - 4 && c.y + tbH <= wr.height - 4
      const hits = (c: { x: number; y: number }, r: { l: number; t: number; r: number; b: number }) => c.x < r.r && c.x + tbW > r.l && c.y < r.b && c.y + tbH > r.t
      tb = cands.find(c => visible(c) && !others.some(o => hits(c, o)))
        ?? cands.find(c => visible(c) && !hits(c, s))
        ?? { x: clampX(mx - tbW / 2), y: clampY(s.t - gap - tbH) }
      tb = { x: Math.round(tb.x), y: Math.round(tb.y) }
    }
    setOverlay(prev => (Math.abs(prev.scale - scale) < 1e-3 && prev.tb?.x === tb?.x && prev.tb?.y === tb?.y) ? prev : { scale, tb })
  })

  const point = (clientX: number, clientY: number) => {
    const matrix = roomGroup.current?.getScreenCTM()
    if (!matrix) return { x: cx, y: cy }
    const pt = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return { x: pt.x, y: pt.y }
  }
  const screenPoint = (clientX: number, clientY: number) => {
    const matrix = svg.current?.getScreenCTM()
    if (!matrix) return { x: cx, y: cy }
    const pt = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return { x: pt.x, y: pt.y }
  }
  const startPan = (e: PointerEvent<Element>) => {
    p.onSelect(null)
    const cursor = screenPoint(e.clientX, e.clientY)
    pan.current = { ...offset, px: cursor.x, py: cursor.y }
    svg.current?.setPointerCapture(e.pointerId)
  }
  const selectDown = (e: PointerEvent<SVGGElement>, item: Furniture) => {
    if (space || e.button !== 0) return
    e.stopPropagation(); p.onSelect(item.id)
    if (p.mobile && p.editMode === 'resize') return
    const pos = point(e.clientX, e.clientY)
    drag.current = { type: 'move', id: item.id, dx: pos.x - item.x, dy: pos.y - item.y, committed: false }
    svg.current?.setPointerCapture(e.pointerId)
  }
  const handleDown = (e: PointerEvent<SVGCircleElement>, item: Furniture, sx: number, sy: number) => {
    e.stopPropagation()
    const o = rotate(-sx * item.width / 2, -sy * item.depth / 2, item.rotation)
    drag.current = { type: 'resize', id: item.id, original: item, sx, sy, anchor: { x: item.x + o.x, y: item.y + o.y }, committed: false }
    setDragging('resize')
    svg.current?.setPointerCapture(e.pointerId)
  }
  const begin = () => { const d = drag.current; if (d && !d.committed) { p.onCommit(); d.committed = true; if (d.type === 'move') setDragging('move') } }
  const emit = (next: Furniture) => { if (!drag.current) return; begin(); p.onMove(next) }
  const emitMany = (next: Furniture[]) => { if (!drag.current) return; begin(); p.onMoveMany(next) }
  const endDrag = () => { drag.current = null; pan.current = null; setDragging(null); setTip(null); setGuides([]) }
  const pinchState = () => {
    const [a, b] = [...touches.current.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }
  /** Every pointer is tracked; a second finger cancels any drag and starts pinch/pan. */
  const onPointerDownCapture = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'touch') return
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (e.pointerType === 'touch' && touches.current.size === 2) {
      e.stopPropagation(); e.preventDefault()
      drag.current = null; pan.current = null; setDragging(null); setTip(null); setGuides([])
      const st = pinchState()
      pinch.current = { dist: st.dist, zoom, anchor: point(st.mid.x, st.mid.y) }
      svg.current?.setPointerCapture(e.pointerId)
    }
  }
  const onPointerEnd = (e: PointerEvent<SVGSVGElement>) => {
    touches.current.delete(e.pointerId)
    if (pinch.current && touches.current.size === 1) {
      const remaining = [...touches.current.values()][0]
      const cursor = screenPoint(remaining.x, remaining.y)
      pan.current = { ...offset, px: cursor.x, py: cursor.y }
    }
    if (touches.current.size < 2) pinch.current = null
    if (touches.current.size === 0) endDrag()
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pz = pinch.current
    if (pz && touches.current.size >= 2) {
      const st = pinchState()
      const nextZoom = Math.max(.5, Math.min(4, pz.zoom * st.dist / pz.dist))
      const cursor = screenPoint(st.mid.x, st.mid.y)
      setZoom(nextZoom)
      setOffset({ x: cursor.x - cx - nextZoom * (pz.anchor.x - cx), y: cursor.y - cy - nextZoom * (pz.anchor.y - cy) })
      return
    }
    const d = drag.current
    if (d) {
      const item = p.furniture.find(f => f.id === d.id)
      if (!item) return
      const pt = point(e.clientX, e.clientY)
      const group = d.type === 'move' ? groupOf(item, p.furniture) : [item]
      if (d.type === 'move' && group.length > 1) {
        // Grouped sofa: translate every section together, keeping the combined footprint inside the room.
        let tx = pt.x - d.dx, ty = pt.y - d.dy
        if (p.snap) { tx = Math.round(tx / 5) * 5; ty = Math.round(ty / 5) * 5 }
        let moved = translate(group, tx - item.x, ty - item.y)
        if (p.snap) {
          const u = unionBounds(moved), r = interior(p.project), th = 12
          const sx = Math.abs(u.minX - r.left) < th ? r.left - u.minX : Math.abs(r.right - u.maxX) < th ? r.right - u.maxX : 0
          const sy = Math.abs(u.minY - r.top) < th ? r.top - u.minY : Math.abs(r.bottom - u.maxY) < th ? r.bottom - u.maxY : 0
          moved = translate(moved, sx, sy)
        }
        const fitted = clampGroup(moved, p.project)
        if (fitted && fitted.some((f, i) => f.x !== group[i].x || f.y !== group[i].y)) emitMany(fitted)
      } else if (d.type === 'move' && item.mount === 'wall') {
        // Wall-mounted: slide along the wall, or hop to whichever solid wall is nearest the pointer.
        const next = mountNearest(item, p.project, { x: pt.x - d.dx, y: pt.y - d.dy })
        if (next && (next.x !== item.x || next.y !== item.y)) emit(p.snap ? mountNearest({ ...next, along: Math.round((next.along ?? 0) / 5) * 5 }, p.project, { x: next.x, y: next.y }) ?? next : next)
      } else if (d.type === 'move') {
        let next = { ...item, x: pt.x - d.dx, y: pt.y - d.dy }
        if (Math.hypot(next.x - item.x, next.y - item.y) < .01) return
        if (p.snap) {
          next.x = Math.round(next.x / 5) * 5; next.y = Math.round(next.y / 5) * 5
          if (isHaven(item)) { // magnetic snapping between sofa sections
            const res = magnetSnap({ ...item, x: pt.x - d.dx, y: pt.y - d.dy }, p.furniture.filter(f => f.id !== item.id && isHaven(f)))
            if (res.guides.length) next = res.item
            setGuides(res.guides)
          }
          next = snapToWalls(next, p.project)
        }
        const fitted = clampInside(next, p.project) // stops at the wall instead of crossing it
        if (fitted && (fitted.x !== item.x || fitted.y !== item.y)) emit(fitted)
      } else {
        const { original, sx, sy, anchor } = d
        const local = rotate(pt.x - anchor.x, pt.y - anchor.y, -original.rotation)
        let tw = Math.max(10, sx * local.x), td = Math.max(10, sy * local.y)
        if (p.snap) { tw = Math.round(tw); td = Math.round(td) }
        if (isCircular(original)) tw = td = Math.min(tw, td)
        const make = (w: number, dd: number): Furniture => { const c = rotate(sx * w / 2, sy * dd / 2, original.rotation); return { ...resizeModule(item, w, dd), x: anchor.x + c.x, y: anchor.y + c.y } }
        let next = make(tw, td)
        if (!inside(next, p.project)) {
          let lo = 0, hi = 1
          for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (inside(make(original.width + (tw - original.width) * mid, original.depth + (td - original.depth) * mid), p.project)) lo = mid; else hi = mid }
          next = make(original.width + (tw - original.width) * lo, original.depth + (td - original.depth) * lo)
        }
        if (inside(next, p.project)) emit(next)
        const wr = wrap.current?.getBoundingClientRect()
        if (wr) setTip({ x: e.clientX - wr.left, y: e.clientY - wr.top })
      }
    } else if (pan.current) {
      const s = pan.current
      const cursor = screenPoint(e.clientX, e.clientY)
      setOffset({ x: s.x + cursor.x - s.px, y: s.y + cursor.y - s.py })
    }
  }
  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    const anchor = point(e.clientX, e.clientY), cursor = screenPoint(e.clientX, e.clientY)
    const nextZoom = Math.max(.5, Math.min(4, zoom * (e.deltaY > 0 ? .9 : 1.1)))
    setZoom(nextZoom)
    setOffset({ x: cursor.x - cx - nextZoom * (anchor.x - cx), y: cursor.y - cy - nextZoom * (anchor.y - cy) })
  }
  const onDrop = (e: DragEvent<SVGSVGElement>) => {
    e.preventDefault(); const kind = e.dataTransfer.getData('application/roomform') as FurnitureKind
    if (kind) { const pos = point(e.clientX, e.clientY); p.onAdd(kind, pos.x, pos.y) }
  }
  // Live measurements: recomputed from the current geometry on every change
  // (including each pointer move while dragging, resizing or rotating).
  const layout = activeLayout(p.project)
  const dims = useMemo(() => buildDims(p.project, { ...layout, furniture: p.furniture }, {
    mode: p.measureMode, selectedId: p.mobile && p.editMode === 'resize' ? null : p.selectedId, k, compact: coarse,
    include: p.measureMode === 'all' ? { ...ALL_INCLUDE, outdoor: !coarse } : { room: true, furniture: true, walls: true, pairs: true, openings: true, outdoor: false },
    detail: p.measureMode === 'all' || coarse ? 'basic' : 'detailed',
  }), [p.project, layout, p.furniture, p.measureMode, p.selectedId, p.mobile, p.editMode, k, coarse])
  const ordered = [...p.furniture.filter(f => f.kind === 'rug'), ...p.furniture.filter(f => f.kind !== 'rug' && !f.supportId), ...p.furniture.filter(f => f.kind !== 'rug' && f.supportId)]
  const support = selected?.supportId ? p.furniture.find(f => f.id === selected.supportId) : undefined
  const hr = (coarse ? 7 : 4.5) * k, pad = 3 * k, hit = coarse ? 3.4 : 2.2
  return <div className="plan-wrap" ref={wrap}>
    <svg ref={svg} viewBox={`${vb.l - PAD} ${vb.t - PAD} ${vb.r - vb.l + PAD * 2} ${vb.b - vb.t + PAD * 2}`} preserveAspectRatio="xMidYMid meet" className="plan-svg" role="img" aria-label="Interactive bedroom floor plan"
      onWheel={onWheel} onDragOver={e => e.preventDefault()} onDrop={onDrop}
      onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onPointerDownCapture={onPointerDownCapture}
      onPointerDown={e => { if (e.target === svg.current) startPan(e) }}
      onKeyDown={e => { if (e.code === 'Space') setSpace(true) }} onKeyUp={e => { if (e.code === 'Space') setSpace(false) }} tabIndex={0}>
      <PlanDefs appearance={appearance} outdoor={p.project.outdoor} />
      <g ref={roomGroup} transform={`translate(${cx + offset.x} ${cy + offset.y}) scale(${zoom}) translate(${-cx} ${-cy})`}>
        <RoomShell project={p.project} appearance={appearance} showGrid={p.showGrid} showMeasurements={false} k={k} onBackgroundDown={startPan} openDoors={p.openDoors} />
        {support&&<rect x={-support.width/2-3*k} y={-support.depth/2-3*k} width={support.width+6*k} height={support.depth+6*k} rx={5*k} transform={`translate(${support.x} ${support.y}) rotate(${support.rotation})`} fill="#6a9b76" fillOpacity=".07" stroke="#6a9b76" strokeOpacity=".65" strokeWidth={1.2*k} strokeDasharray={`${4*k} ${3*k}`} pointerEvents="none"/>}
        {ordered.map(item => <g key={item.id} onPointerDown={e => selectDown(e, item)} style={{ cursor: dragging === 'move' && item.id === p.selectedId ? 'grabbing' : 'grab' }}>
          <FurnitureArt item={item} invalid={warnings(item, p.furniture, p.project).length > 0} />
          {isLShape(item)
            ? <polygon points={lOutline(item).map(q => `${q.x},${q.y}`).join(' ')} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} fill="transparent" />
            : isCircular(item)
            ? <ellipse cx={item.x} cy={item.y} rx={Math.max(item.width / 2, p.mobile ? 22 * k : 0)} ry={Math.max(item.depth / 2, p.mobile ? 22 * k : 0)} fill="transparent" />
            : <rect x={-Math.max(item.width, p.mobile ? 44 * k : 0) / 2} y={-Math.max(item.mount === 'wall' ? Math.max(item.depth, 14) + 6 : item.depth, p.mobile ? 44 * k : 0) / 2} width={Math.max(item.width, p.mobile ? 44 * k : 0)} height={Math.max(item.mount === 'wall' ? Math.max(item.depth, 14) + 6 : item.depth, p.mobile ? 44 * k : 0)} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} fill="transparent" />}
        </g>)}
        {ordered.map(item => <FurnitureLabel key={item.id} item={item} k={k} />)}
        {guides.map((g, i) => <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#2f9a74" strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeLinecap="round" pointerEvents="none" />)}
        {isGroup && members.map(m => <rect key={m.id} x={-m.width / 2 - pad / 2} y={-m.depth / 2 - pad / 2} width={m.width + pad} height={m.depth + pad} rx={3 * k} transform={`translate(${m.x} ${m.y}) rotate(${m.rotation})`} fill="none" stroke="#2f6b5a" strokeOpacity={m.id === selected?.id ? 1 : .55} strokeWidth={1.2} vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
        {selected && !isGroup && <g transform={`translate(${selected.x} ${selected.y}) rotate(${selected.rotation})`}>
          {isCircular(selected)
            ? <ellipse rx={selected.width / 2 + pad} ry={selected.depth / 2 + pad} fill="none" stroke="#2f6b5a" strokeWidth={1.25} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            : <rect x={-selected.width / 2 - pad} y={-selected.depth / 2 - pad} width={selected.width + pad * 2} height={selected.depth + pad * 2} rx={2 * k} fill="none" stroke="#2f6b5a" strokeWidth={1.25} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
          {selected.mount !== 'wall' && (!p.mobile || p.editMode === 'resize') && ([-1, 1] as const).flatMap(sx => ([-1, 1] as const).map(sy => <g key={`${sx}:${sy}`}>
            <circle cx={sx * (selected.width / 2 + pad)} cy={sy * (selected.depth / 2 + pad)} r={hr} fill="#fff" stroke="#2f6b5a" strokeWidth={1.4} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            <circle data-resize-handle={`${sx}:${sy}`} cx={sx * (selected.width / 2 + pad)} cy={sy * (selected.depth / 2 + pad)} r={hr * hit} fill="transparent" style={{ cursor: `${sx === sy ? 'nwse' : 'nesw'}-resize` }} onPointerDown={e => handleDown(e, selected, sx, sy)} />
          </g>))}
        </g>}
        <DimensionLayer dims={dims} k={k} compact={coarse} furniture={p.furniture} />
      </g>
    </svg>
    {!p.mobile && selected && overlay.tb && !dragging && <div className="floating-toolbar" style={{ left: overlay.tb.x, top: overlay.tb.y }} onPointerDown={e => e.stopPropagation()}>
      <button title="Edit size" aria-label="Edit size" onClick={p.onEditSize}><Ruler size={16} strokeWidth={1.8} /></button>
      <button title="Rotate 90°" aria-label="Rotate 90 degrees" onClick={p.onRotate}><RotateCw size={16} strokeWidth={1.8} /></button>
      <button title="Duplicate" aria-label="Duplicate" onClick={p.onDuplicate}><Copy size={16} strokeWidth={1.8} /></button>
      <span className="toolbar-sep" />
      <button title="Delete" aria-label="Delete" className="danger" onClick={p.onDelete}><Trash2 size={16} strokeWidth={1.8} /></button>
    </div>}
    {dragging === 'resize' && tip && selected && <div className="resize-tip" style={{ left: tip.x + 14, top: tip.y - 34 }}>{Math.round(selected.width)} × {Math.round(selected.depth)} cm</div>}
    <div className="plan-zoom"><button title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(.5, z / 1.2))}>−</button><span>{Math.round(zoom * 100)}%</span><button title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(4, z * 1.2))}>+</button><button className="fit-room" title="Fit room" aria-label="Fit room" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }}>{p.mobile ? 'Fit Room' : '⌑'}</button></div>
    <div className="plan-hint">{isGroup ? 'Grouped sofa · Ungroup in the sidebar to move sections' : p.mobile ? p.editMode === 'resize' ? 'Resize mode · Drag a corner handle' : 'Move mode · Drag furniture · Pinch to zoom' : coarse ? 'Drag to move · Pinch to zoom · Two fingers to pan' : 'Drag to move · Corners to resize · Scroll to zoom'}</div>
  </div>
}
