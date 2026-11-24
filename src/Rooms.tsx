import { useRef, useState, type ReactNode } from 'react'
import { AirVent, AppWindow, Copy, DoorOpen, FolderOpen, Pencil, Plus, Trees, Trash2, X } from 'lucide-react'
import { activeLayout, groundPresets, roomTypes, ROOM_LIMITS, WALL_NAMES, newDoor, newWindow, type AC, type Door, type DoorKind, type GlassFrame, type GroundKind, type Project, type RoomType, type WallName, type WallType, type WindowSpec } from './model'
import { exterior, wallFrame } from './geometry'
import { FurnitureArt, PlanDefs, RoomShell } from './PlanArt'
import { Collapsible, Modal, NumberField, Segmented, useModalLayer } from './ui'
import { groundDataUrl } from './textures'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
export type Unit = 'cm' | 'm'
export const toCm = (v: number, u: Unit) => u === 'm' ? v * 100 : v
export const fromCm = (v: number, u: Unit) => u === 'm' ? Math.round(v) / 100 : Math.round(v * 10) / 10

/** Small static plan of a room's active design. */
export function RoomThumb({ room }: { room: Project }) {
  const layout = activeLayout(room), { width: W, depth: D } = room.room
  const ext = exterior(room)
  const l = Math.min(0, ext?.left ?? 0), t = Math.min(0, ext?.top ?? 0), r = Math.max(W, ext?.right ?? W), b = Math.max(D, ext?.bottom ?? D)
  const pad = Math.max(r - l, b - t) * .04, prefix = `t${room.id.slice(0, 8)}`
  return <svg className="room-thumb" viewBox={`${l - pad} ${t - pad} ${r - l + pad * 2} ${b - t + pad * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
    <PlanDefs appearance={layout.appearance} prefix={prefix} outdoor={room.outdoor} />
    <RoomShell project={room} appearance={layout.appearance} showGrid={false} showMeasurements={false} k={Math.max(r - l, b - t) / 200} prefix={prefix} />
    {[...layout.furniture.filter(f => f.kind === 'rug'), ...layout.furniture.filter(f => f.kind !== 'rug' && !f.supportId), ...layout.furniture.filter(f => f.kind !== 'rug' && f.supportId)].map(f => <FurnitureArt key={f.id} item={f} prefix={prefix} />)}
  </svg>
}
const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function RoomsPanel({ rooms, activeId, onOpen, onRename, onDuplicate, onDelete, onNew, onClose }:
  { rooms: Project[]; activeId: string; onOpen: (id: string) => void; onRename: (id: string) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onNew: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useModalLayer(ref, onClose)
  return <div className="modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div ref={ref} className="rooms-panel" role="dialog" aria-modal="true" aria-label="My Rooms">
      <div className="rooms-head"><div><h2>My Rooms</h2><p>Every room keeps its own size, walls, openings and saved designs.</p></div>
        <button className="primary-button" data-autofocus onClick={onNew}><Plus size={16} /> New Room</button>
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={17} /></button></div>
      <div className="room-cards">{rooms.map(r => <div key={r.id} className={`room-card-item ${r.id === activeId ? 'active' : ''}`}>
        <button className="room-card-open" onClick={() => onOpen(r.id)} title={`Open ${r.name}`}>
          <RoomThumb room={r} />
          <span className="room-card-copy"><strong>{r.name}</strong>
            <small>{r.room.width} × {r.room.depth} cm · {r.layouts.length} design{r.layouts.length === 1 ? '' : 's'}</small>
            <small>{roomTypes[r.roomType].name} · edited {fmtDate(r.updatedAt)}</small></span>
          {r.id === activeId && <em className="room-current">Open</em>}
        </button>
        <div className="room-card-actions">
          <button onClick={() => onOpen(r.id)} title="Open"><FolderOpen size={14} /> Open</button>
          <button onClick={() => onRename(r.id)} title="Rename"><Pencil size={14} /></button>
          <button onClick={() => onDuplicate(r.id)} title="Duplicate"><Copy size={14} /></button>
          <button className="danger" onClick={() => onDelete(r.id)} title="Delete" disabled={rooms.length <= 1}><Trash2 size={14} /></button>
        </div>
      </div>)}</div>
      <p className="rooms-note">Rooms are saved in this browser only. Use Export → Entire project JSON to back up or move them to another device.</p>
    </div>
  </div>
}

export function NewRoomModal({ onCreate, onClose }: { onCreate: (name: string, type: RoomType, dims: Project['room']) => string | null; onClose: () => void }) {
  const [type, setType] = useState<RoomType>('garden')
  const [unit, setUnit] = useState<Unit>('m')
  const preset = roomTypes[type]
  const [name, setName] = useState('Garden Room')
  const [dims, setDims] = useState({ width: String(fromCm(preset.width, 'm')), depth: String(fromCm(preset.depth, 'm')), ceiling: String(fromCm(preset.ceiling, 'm')) })
  const [error, setError] = useState('')
  const pickType = (t: RoomType) => {
    const p = roomTypes[t]; setType(t)
    setDims({ width: String(fromCm(p.width, unit)), depth: String(fromCm(p.depth, unit)), ceiling: String(fromCm(p.ceiling, unit)) })
    if (!name.trim() || Object.values(roomTypes).some(r => r.name === name || r.name.replace(' Room', '') === name || name === 'Garden Room')) setName(t === 'standard' ? 'New Room' : t === 'custom' ? 'Custom Room' : p.name)
  }
  const switchUnit = (u: Unit) => { if (u === unit) return; setDims(d => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Number.isFinite(Number(v)) && v.trim() ? String(fromCm(toCm(Number(v), unit), u)) : v])) as typeof d); setUnit(u) }
  const submit = () => {
    const w = toCm(Number(dims.width), unit), d = toCm(Number(dims.depth), unit), c = toCm(Number(dims.ceiling), unit)
    const { min, max, ceilingMin, ceilingMax } = ROOM_LIMITS
    if (!name.trim()) return setError('Give the room a name.')
    if (![w, d, c].every(Number.isFinite)) return setError('Enter numbers for every dimension.')
    if (w < min || w > max || d < min || d > max) return setError(`Width and depth must be between ${fromCm(min, unit)} and ${fromCm(max, unit)} ${unit}.`)
    if (c < ceilingMin || c > ceilingMax) return setError(`Ceiling height must be between ${fromCm(ceilingMin, unit)} and ${fromCm(ceilingMax, unit)} ${unit}.`)
    const err = onCreate(name.trim(), type, { width: Math.round(w * 10) / 10, depth: Math.round(d * 10) / 10, ceiling: Math.round(c * 10) / 10 })
    if (err) setError(err); else onClose()
  }
  return <Modal title="New Room" subtitle="Your current room and its designs stay exactly as they are." onClose={onClose}>
    <form className="modal-body" onSubmit={e => { e.preventDefault(); submit() }}>
      <label className="modal-text-field"><span>Room name</span><input autoFocus value={name} onChange={e => { setName(e.target.value); setError('') }} /></label>
      <span className="mini-label">Room type <small>a starting preset — everything stays editable</small></span>
      <div className="room-types">{(Object.keys(roomTypes) as RoomType[]).map(t => <button type="button" key={t} className={type === t ? 'active' : ''} onClick={() => pickType(t)}>{roomTypes[t].name}</button>)}</div>
      <div className="unit-row"><span className="mini-label">Dimensions</span><Segmented value={unit} options={[{ value: 'm', label: 'Meters' }, { value: 'cm', label: 'Centimeters' }]} onChange={switchUnit} /></div>
      <div className="modal-fields three">
        {(['width', 'depth', 'ceiling'] as const).map(k => <label key={k} className="number-field"><span>{k === 'ceiling' ? 'Ceiling height' : cap(k)}</span><div><input type="number" step="any" inputMode="decimal" value={dims[k]} onChange={e => { setDims(d => ({ ...d, [k]: e.target.value })); setError('') }} /><small>{unit}</small></div></label>)}
      </div>
      {type === 'garden' && <p className="field-note">Garden rooms start with three solid walls, a full-height glass front with a sliding door, oak flooring and a lawn outside.</p>}
      {error && <div className="modal-error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Create Room</button></div>
    </form>
  </Modal>
}

const wallOptions = WALL_NAMES.map(w => ({ value: w, label: cap(w) }))
const along = (w: WallName) => w === 'top' || w === 'bottom' ? 'left' : 'top'
/** Room structure editors: wall types, doors, windows, AC and the outdoor area. */
export function RoomStructure({ project, onOpenings, onWallType, onStructural, unit }:
  { project: Project; unit: Unit; onOpenings: (fn: (d: Project) => void) => void; onWallType: (wall: WallName, type: WallType) => void; onStructural: (fn: (d: Project) => void) => void }) {
  const [wall, setWall] = useState<WallName>('bottom')
  const spec = project.walls[wall]
  const len = (w: WallName) => wallFrame(w, project).length
  const RC = project.room.ceiling
  const N = (label: string, v: number, set: (n: number) => void, min = 0, max = 100000) => <NumberField label={label} value={fromCm(v, unit)} min={fromCm(min, unit)} max={fromCm(max, unit)} step={unit === 'm' ? .01 : 1} suffix={unit} onChange={n => set(toCm(n, unit))} />
  const doorEditor = (d: Door, i: number): ReactNode => <Collapsible key={d.id} title={project.doors.length > 1 ? `Door ${i + 1}` : 'Door'} icon={<DoorOpen size={16} />} summary={`${d.kind === 'sliding' ? 'Sliding' : d.kind === 'glass' ? 'Glass' : ''} ${fromCm(d.width, unit)} ${unit} · ${d.wall}`.trim()}>
    <span className="mini-label">Type</span><Segmented value={d.kind} options={[{ value: 'hinged', label: 'Door' }, { value: 'glass', label: 'Glass door' }, { value: 'sliding', label: 'Sliding glass' }] as { value: DoorKind; label: string }[]} onChange={v => onOpenings(p => { const x = p.doors.find(o => o.id === d.id)!; x.kind = v; if (v !== 'hinged' && x.color === '#ece6dc') x.color = '#2b2d30'; if (v === 'hinged' && x.color === '#2b2d30') x.color = '#ece6dc' })} />
    <span className="mini-label">Wall</span><Segmented value={d.wall} options={wallOptions} onChange={v => onOpenings(p => { p.doors.find(o => o.id === d.id)!.wall = v })} />
    <div className="field-grid spaced">
      {N('Width', d.width, n => onOpenings(p => { p.doors.find(o => o.id === d.id)!.width = n }), 40, len(d.wall))}
      {N('Height', d.height, n => onOpenings(p => { p.doors.find(o => o.id === d.id)!.height = n }), 150, RC)}
      {N(`From ${along(d.wall)} corner`, d.start, n => onOpenings(p => { p.doors.find(o => o.id === d.id)!.start = n }), 0, len(d.wall))}
    </div>
    {d.kind !== 'sliding' && <><span className="mini-label">Hinge side</span><Segmented value={d.hinge} options={d.wall === 'top' || d.wall === 'bottom' ? [{ value: 'start', label: 'Left' }, { value: 'end', label: 'Right' }] : [{ value: 'start', label: 'Top' }, { value: 'end', label: 'Bottom' }]} onChange={v => onOpenings(p => { p.doors.find(o => o.id === d.id)!.hinge = v as Door['hinge'] })} />
      <span className="mini-label">Opens</span><Segmented value={d.swing} options={[{ value: 'in', label: 'Inward' }, { value: 'out', label: 'Outward' }]} onChange={v => onOpenings(p => { p.doors.find(o => o.id === d.id)!.swing = v as Door['swing'] })} /></>}
    {d.kind === 'sliding' && <><span className="mini-label">Sliding panel moves toward</span><Segmented value={d.hinge} options={d.wall === 'top' || d.wall === 'bottom' ? [{ value: 'start', label: 'Left' }, { value: 'end', label: 'Right' }] : [{ value: 'start', label: 'Top' }, { value: 'end', label: 'Bottom' }]} onChange={v => onOpenings(p => { p.doors.find(o => o.id === d.id)!.hinge = v as Door['hinge'] })} /></>}
    <label className="color-field"><span>{d.kind === 'hinged' ? 'Door color' : 'Frame color'}</span><input type="color" value={d.color ?? '#ece6dc'} onChange={e => onOpenings(p => { p.doors.find(o => o.id === d.id)!.color = e.target.value })} /></label>
    <button className="remove-link" onClick={() => onOpenings(p => { p.doors = p.doors.filter(o => o.id !== d.id) })}><Trash2 size={13} /> Remove door</button>
  </Collapsible>
  const windowEditor = (w: WindowSpec, i: number): ReactNode => <Collapsible key={w.id} title={project.windows.length > 1 ? `Window ${i + 1}` : 'Window'} icon={<AppWindow size={16} />} summary={`${fromCm(w.width, unit)} ${unit} · ${w.wall}`}>
    <span className="mini-label">Wall</span><Segmented value={w.wall} options={wallOptions} onChange={v => onOpenings(p => { p.windows.find(o => o.id === w.id)!.wall = v })} />
    <div className="field-grid spaced">
      {N('Width', w.width, n => onOpenings(p => { p.windows.find(o => o.id === w.id)!.width = n }), 20, len(w.wall))}
      {N(`From ${along(w.wall)} corner`, w.start, n => onOpenings(p => { p.windows.find(o => o.id === w.id)!.start = n }), 0, len(w.wall))}
      {N('Above floor', w.sill, n => onOpenings(p => { p.windows.find(o => o.id === w.id)!.sill = n }), 0, RC)}
      {N('Window height', w.height, n => onOpenings(p => { p.windows.find(o => o.id === w.id)!.height = n }), 20, RC)}
    </div>
    <button className="remove-link" onClick={() => onOpenings(p => { p.windows = p.windows.filter(o => o.id !== w.id) })}><Trash2 size={13} /> Remove window</button>
  </Collapsible>
  const solidWalls = WALL_NAMES.filter(w => project.walls[w].type === 'solid')
  const addDoor = () => onOpenings(p => { const w = WALL_NAMES.find(x => p.walls[x].type !== 'open') ?? 'top'; p.doors.push(newDoor({ wall: w, start: len(w) / 2 - 45 })) })
  const addWindow = () => onOpenings(p => { const w = solidWalls.find(x => !p.windows.some(o => o.wall === x)) ?? solidWalls[0] ?? 'left'; p.windows.push(newWindow({ wall: w, start: len(w) / 2 - 60, width: Math.min(120, len(w) - 40) })) })
  const ac: AC | null = project.ac
  const o = project.outdoor
  return <>
    <Collapsible title="Walls" icon={<span className="wall-icon" />} summary={WALL_NAMES.map(w => project.walls[w].type[0].toUpperCase()).join(' ')} open>
      <span className="mini-label">Select a wall</span>
      <div className="wall-picker">{WALL_NAMES.map(w => <button key={w} className={`${wall === w ? 'active' : ''} wt-${project.walls[w].type}`} onClick={() => setWall(w)}><i />{cap(w)}<small>{project.walls[w].type}</small></button>)}</div>
      <span className="mini-label">{cap(wall)} wall type</span>
      <Segmented value={spec.type} options={[{ value: 'solid', label: 'Solid' }, { value: 'glass', label: 'Glass' }, { value: 'open', label: 'Open side' }] as { value: WallType; label: string }[]} onChange={v => onWallType(wall, v)} />
      {spec.type !== 'open' && <div className="field-grid spaced">{N('Thickness', spec.thickness, n => onStructural(p => { p.walls[wall].thickness = n }), 2, 60)}</div>}
      {spec.type === 'glass' && <><span className="mini-label">Frame</span><Segmented value={spec.frame} options={[{ value: 'none', label: 'Frameless' }, { value: 'black', label: 'Black' }, { value: 'white', label: 'White' }, { value: 'aluminum', label: 'Aluminum' }] as { value: GlassFrame; label: string }[]} onChange={v => onStructural(p => { p.walls[wall].frame = v })} />
        <small className="field-note">Full-height glazing. Add a sliding glass door below to walk through it.</small></>}
      {spec.type === 'open' && <small className="field-note">No wall on this side — furniture can reach the room edge.</small>}
    </Collapsible>
    {project.doors.map(doorEditor)}
    {project.windows.map(windowEditor)}
    {ac && <Collapsible title="Air conditioner" icon={<AirVent size={16} />} summary={`${fromCm(ac.width, unit)} ${unit} · ${ac.wall}`}>
      <span className="mini-label">Wall</span><Segmented value={ac.wall} options={wallOptions} onChange={v => onOpenings(p => { p.ac!.wall = v })} />
      <div className="field-grid spaced">
        {N('Width', ac.width, n => onOpenings(p => { p.ac!.width = n }), 20, 300)}
        {N('Height', ac.height, n => onOpenings(p => { p.ac!.height = n }), 10, 150)}
        {N(`From ${along(ac.wall)} corner`, ac.start, n => onOpenings(p => { p.ac!.start = n }), 0, len(ac.wall))}
        {N('Mounted at', ac.mount, n => onOpenings(p => { p.ac!.mount = n }), 0, RC)}
      </div>
      <button className="remove-link" onClick={() => onOpenings(p => { p.ac = null })}><Trash2 size={13} /> Remove AC</button>
    </Collapsible>}
    <div className="add-openings">
      <button onClick={addDoor}><Plus size={13} /> Door</button>
      <button onClick={addWindow} disabled={!solidWalls.length}><Plus size={13} /> Window</button>
      {!ac && <button onClick={() => onOpenings(p => { const w = solidWalls[0] ?? 'left'; p.ac = { wall: w, start: len(w) / 2 - 37, width: 75, height: 30, mount: Math.min(212, RC - 40) } })} disabled={!solidWalls.length}><Plus size={13} /> AC</button>}
    </div>
    <Collapsible title="Outdoor area" icon={<Trees size={16} />} summary={o.visible && o.ground !== 'none' ? groundPresets[o.ground].name : 'None'}>
      <div className="ground-cards">{(Object.keys(groundPresets) as GroundKind[]).map(g => <button key={g} className={o.ground === g ? 'active' : ''} onClick={() => onStructural(p => { p.outdoor.ground = g; p.outdoor.visible = g !== 'none'; if (g !== o.ground && g !== 'none') p.outdoor.color = groundPresets[g].color })}>
        <span className="ground-swatch" style={g === 'none' ? undefined : { backgroundImage: `url(${groundDataUrl(g, o.ground === g ? o.color : groundPresets[g].color)})` }} />{groundPresets[g].name}</button>)}</div>
      {o.ground !== 'none' && <>
        <label className="toggle-row"><input type="checkbox" checked={o.visible} onChange={e => onStructural(p => { p.outdoor.visible = e.target.checked })} /> Show outdoor area</label>
        <label className="color-field"><span>{o.ground === 'grass' ? 'Grass tone' : 'Ground color'}</span><input type="color" value={o.color} onChange={e => onStructural(p => { p.outdoor.color = e.target.value })} /></label>
        <span className="mini-label">Extends beyond the walls <small>not part of the room size</small></span>
        <div className="field-grid">{WALL_NAMES.map(w => <span key={w}>{N(cap(w), o.extend[w], n => onStructural(p => { p.outdoor.extend[w] = n }), 0, 5000)}</span>)}</div>
      </>}
    </Collapsible>
  </>
}
