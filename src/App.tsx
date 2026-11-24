import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Armchair, Circle, Menu, Move, Pencil as PencilIcon, SlidersHorizontal, Sofa as SofaIcon, Upload as UploadIcon, Lightbulb, RectangleVertical, Search, Tv, BedDouble, Box, Check, ChevronDown, CircleAlert, CircleHelp, Compass, CloudOff, Copy, Download, FilePlus2, Footprints, Gamepad2, Grid3X3, House, Layers3, LayoutGrid, LoaderCircle, Maximize2, Monitor, Paintbrush, Pencil, Plus, RectangleHorizontal, Redo2, RotateCw, Ruler, Save, Sofa, Sparkles, Sprout, Sun, Table2, Trash2, Undo2, Upload, View, X, Group, Ungroup } from 'lucide-react'
import FloorPlan from './FloorPlan'
import { anyDialogOpen, Modal, NumberField, Segmented, Toast, useDialogs } from './ui'
type AddOptions={width:number;depth:number;height:number;rugShape?:'rectangle'|'circle';mount?:MirrorMount;chaise?:'left'|'right';armDepth?:number}
import type { CameraView } from './Room3D'
import { clone, onMediaChange } from './compat'
import { AppErrorBoundary } from './ErrorBoundary'
import Home from './Home'
import { OnboardingTour, SPLASH_THIS_LOAD, WelcomeInvite, WelcomeSplash, readOnboarding, writeOnboarding, type OnboardingStatus } from './Onboarding'
import { activeLayout, activeRoom, catalog, CATEGORIES, frameColors, isMirrorKind, lugoColors, lugoFabrics, mirrorDepth, mirrorSpecs, woodFinishes, type LugoFabric, type MirrorMount, createRoom, defaultAppearance, floorPresets, freshCopy, gamingPresets, isOutdoorKind, loadStudio, newFurniture, normalizeProject, normalizeStudio, palette, ROOM_LIMITS, rugColors, saveStudio, uid, wallPresets, type FloorMaterial, type Furniture, type FurnitureKind, type Material, type Project, type RoomType, type Studio, type WallName, type WallType } from './model'
import { canSupport, clampInside, doorBlocked, isLShape, lArm, findSupport, followSupport, isEligibleSupport, mountNearest, mountOnWall, nextWall, wallFrame, fitOpenings, inside, isSolid, openingIssues, overlaps, placeNear, resizeRoom, warnings } from './geometry'
import { generateIdeas } from './generator'
import { export2D, export3D, exportRoomJson, exportStudioJson } from './export'
import { defaultExportPrefs, ExportDialog, type ExportPrefs } from './ExportDialog'
import type { MeasureMode } from './measure'
import { LibraryPreview } from './PlanArt'
import { buildLux, cornerSize, LUX_DEFAULTS, luxColumn, luxMirror, luxOf, luxSections, luxStyleOf, relayoutLux } from './wardrobe'
import type { LuxStyle } from './model'
import { fromCm, NewRoomModal, RoomsPanel, RoomStructure, toCm, type Unit } from './Rooms'
import { floorDataUrl } from './textures'
import { buildHaven, chaiseSide, officialHavenColors, clampGroup, fabricNames, groupOf, groupSize, havenColors, hvOf, mirrorGroup, resizeModule, rotateGroup, sameGroup, scaleGroup, translate, unionBounds, type Arrangement, type Fabric } from './sofa'

const icons: Record<FurnitureKind,typeof BedDouble>={bed:BedDouble,wardrobe:Box,'wardrobe-l':Box,'wardrobe-l-mirror':Box,'wardrobe-lux':Box,desk:Monitor,bedside:Table2,dresser:Table2,sofa:Armchair,shelf:Layers3,chair:Armchair,gaming:Gamepad2,haven:Sofa,shoe:Footprints,rug:RectangleHorizontal,custom:Maximize2,monitor:Monitor,vase:Circle,decor:Circle,'outdoor-sofa':Sofa,'garden-chair':Armchair,'outdoor-table':Table2,lounger:Sun,planter:Sprout,'mirror-rect':RectangleVertical,'mirror-arch':RectangleVertical,'mirror-round':Circle,'mirror-oval':Circle,'mirror-wavy':RectangleVertical,'mirror-organic':Circle,'mirror-vanity':RectangleVertical,'mirror-floor':RectangleVertical,'tv-unit':Tv,'tv-stand':Tv,'rattan-table':Table2,'lugo-chair':Armchair,'halo-table':Circle}
const Room3D = lazy(() => import('./Room3D'))
const copy=(p:Project):Project=>clone(p)
const WALLS:WallName[]=['top','right','bottom','left']
type SaveState='saved'|'saving'|'error'
type ImportMode='design'|'room'|'project'
const cap=(s:string)=>s[0].toUpperCase()+s.slice(1)

function ActionButton({children,onClick,title,disabled=false}:{children:ReactNode;onClick:()=>void;title?:string;disabled?:boolean}) {return <button className="icon-button" title={title} aria-label={title} onClick={onClick} disabled={disabled}>{children}</button>}
/** Exact-size popup. Fields depend on the shape: mirrors use width × height,
 *  round items a diameter, rugs have no height. */
/** Shown when a library item is chosen: set its size (and shape-specific
 *  options) before it is placed. Bottom sheet on phones. */
function AddFurnitureModal({kind,roomName,maxSide,ceiling,preview,onAdd,onClose}:{kind:FurnitureKind;roomName:string;maxSide:number;ceiling:number;preview:ReactNode;onAdd:(o:AddOptions)=>string|null;onClose:()=>void}) {
  const c=catalog.find(x=>x.kind===kind)!
  const mirror=isMirrorKind(kind), mounts=mirror?mirrorSpecs[kind as keyof typeof mirrorSpecs].mounts:[]
  const r=(v:number)=>String(Math.round(v*10)/10)
  const lShape=kind==='wardrobe-l'||kind==='wardrobe-l-mirror', lux=kind==='wardrobe-lux'
  const [vals,setVals]=useState({width:r(lux?LUX_DEFAULTS.lengthA:c.width),depth:r(lux?LUX_DEFAULTS.lengthB:c.depth),height:r(c.height),diameter:r(kind==='mirror-round'?c.width:Math.min(c.width,c.depth)),arm:r(lux?LUX_DEFAULTS.depth:c.extra?.armDepth??60)})
  const [rugShape,setRugShape]=useState<'rectangle'|'circle'>('rectangle')
  const [mount,setMount]=useState<MirrorMount>((c.extra?.mount as MirrorMount)??mounts[0]??'wall')
  const [chaise,setChaise]=useState<'left'|'right'>('right')
  const [error,setError]=useState('')
  type Key=keyof typeof vals
  const round=kind==='mirror-round'||kind==='halo-table'||(kind==='rug'&&rugShape==='circle')
  const fields:{key:Key;label:string;hint?:string;lo:number;hi:number}[]=lux?[
    {key:'width',label:'Side A length',hint:'Shelves + drawers (changeable)',lo:60,hi:maxSide},
    {key:'depth',label:'Side B length',hint:'Full doors (changeable)',lo:60,hi:maxSide},
    {key:'arm',label:'Depth',hint:'Both sections',lo:35,hi:90},
    {key:'height',label:'Height',hint:'Change each side later',lo:120,hi:ceiling},
  ]:lShape?[
    {key:'width',label:'Side A length',hint:'Along the back wall',lo:80,hi:maxSide},
    {key:'depth',label:'Side B length',hint:'Along the side wall',lo:80,hi:maxSide},
    {key:'arm',label:'Wardrobe depth',hint:'Front to back of each side',lo:30,hi:100},
    {key:'height',label:'Height',lo:60,hi:ceiling},
  ]:[
    ...(round?[{key:'diameter' as Key,label:'Diameter',lo:10,hi:kind==='mirror-round'?Math.min(maxSide,ceiling):maxSide}]
      :[{key:'width' as Key,label:'Width',hint:'Side to side',lo:5,hi:maxSide},...(mirror?[]:[{key:'depth' as Key,label:'Length',hint:'Front to back',lo:5,hi:maxSide}])]),
    ...(kind==='rug'||kind==='mirror-round'?[]:[{key:'height' as Key,label:mirror?'Mirror height':'Height',lo:1,hi:ceiling}]),
  ]
  const submit=()=>{
    for(const f of fields){const v=Number(vals[f.key]);const msg=vals[f.key].trim()===''||!Number.isFinite(v)||v<=0?`${f.label} must be a positive number.`:v<f.lo?`${f.label} must be at least ${f.lo} cm.`:v>f.hi?`${f.label} cannot exceed ${Math.round(f.hi)} cm.`:'';if(msg){setError(msg);return}}
    const n=(k:Key)=>Number(vals[k])
    let width=n('width'),depth=n('depth'),height=n('height')
    if(kind==='mirror-round'){width=height=n('diameter')}
    else if(kind==='halo-table'){width=depth=n('diameter')}
    else if(kind==='rug'){height=c.height;if(rugShape==='circle')width=depth=n('diameter')}
    if(lux&&cornerSize(n('arm'),n('arm'))+Math.max(width,depth)>maxSide){setError('That wardrobe is longer than this room allows.');return}
    if(lShape&&n('arm')>Math.min(width,depth)-20){setError('Wardrobe depth must be at least 20 cm less than the shorter side.');return}
    const err=onAdd({width,depth,height,rugShape:kind==='rug'?rugShape:undefined,mount:mirror?mount:undefined,chaise:kind==='haven'?chaise:undefined,armDepth:lShape||lux?n('arm'):undefined})
    if(err)setError(err)
  }
  return <Modal title={`${c.name} Dimensions`} subtitle={`Set the size before adding it to ${roomName}.`} onClose={onClose} sheet className="add-modal" leading={preview}>
    <form className="modal-body" onSubmit={e=>{e.preventDefault();submit()}} noValidate>
      {kind==='rug'&&<><span className="mini-label">Shape</span><Segmented value={rugShape} options={[{value:'rectangle',label:'Rectangle'},{value:'circle',label:'Round'}]} onChange={v=>{setRugShape(v);setError('')}}/></>}
      {mounts.length>1&&<><span className="mini-label">Mounting</span><Segmented value={mount} options={mounts.map(m=>({value:m,label:m==='wall'?'Wall':m==='free'?'Freestanding':'Leaning'}))} onChange={v=>{setMount(v);setError('')}}/></>}
      {kind==='haven'&&<><span className="mini-label">Chaise position <small>as seen facing the sofa</small></span><Segmented value={chaise} options={[{value:'left',label:'Left'},{value:'right',label:'Right'}]} onChange={setChaise}/></>}
      <div className="modal-fields add-fields">
        {fields.map(f=><label key={f.key} className="modal-field"><span>{f.label} <small>(cm)</small></span><input type="number" inputMode="decimal" step="any" enterKeyHint="done" value={vals[f.key]} onChange={e=>{setVals(v=>({...v,[f.key]:e.target.value}));setError('')}}/>{f.hint&&<em>{f.hint}</em>}</label>)}
      </div>
      {kind==='haven'&&<small className="field-note">Added as grouped Cloud Haven sections, scaled to this overall size.</small>}
      {lux&&<small className="field-note">Added as three grouped sections (Side A, corner mirror, Side B). Ungroup to move, resize or change the height of each side.</small>}
      {lShape&&<small className="field-note">A corner unit: Side A runs along the back, Side B along the left. Rotate it to fit any corner.</small>}
      {mirror&&mount==='wall'&&<small className="field-note">Hung on the nearest free solid wall — adjust the wall and height after adding.</small>}
      {error&&<div className="modal-error" role="alert"><CircleAlert size={16}/>{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button"><Plus size={16}/> Add to Room</button></div>
    </form>
  </Modal>
}
const luxRunDoors=(f:Furniture)=>luxOf(f).doors??Math.max(1,Math.round((f.width-6-(luxColumn(f).col?Math.max(40,Math.min(55,Math.round(f.width*.24))):0))/48))
/** Visual picker for a wardrobe run's front: full doors / LED shelves / shelves + drawers. */
const LUX_STYLES:{value:LuxStyle;label:string;art:ReactNode}[]=[
  {value:'doors',label:'Full Doors',art:<><rect x="3" y="3" width="26" height="26" rx="1" fill="#5e4433"/><rect x="5" y="5" width="10.5" height="22" fill="#e4dbcd"/><rect x="16.5" y="5" width="10.5" height="22" fill="#e4dbcd"/><path d="M14 11v10M18 11v10" stroke="#1c1916" strokeWidth="1.2" strokeLinecap="round"/></>},
  {value:'led',label:'LED Shelves',art:<><rect x="3" y="3" width="26" height="26" rx="1" fill="#5e4433"/><rect x="5" y="5" width="22" height="6" fill="#e4dbcd"/><rect x="5" y="12" width="22" height="15" fill="#8a6a52"/>{[16.5,21.5].map(y=><g key={y}><rect x="5" y={y} width="22" height="1.2" fill="#5e4433"/><rect x="6.5" y={y-1.4} width="19" height=".9" fill="#ffcf80"/></g>)}</>},
  {value:'drawers',label:'Shelves + Drawers',art:<><rect x="3" y="3" width="26" height="26" rx="1" fill="#5e4433"/><rect x="5" y="5" width="22" height="5" fill="#e4dbcd"/><rect x="5" y="11" width="22" height="7" fill="#8a6a52"/><rect x="6.5" y="12" width="19" height=".9" fill="#ffcf80"/>{[19,22.3,25.6].map(y=><g key={y}><rect x="5" y={y} width="22" height="2.6" fill="#e4dbcd"/><rect x="11" y={y+.6} width="10" height=".6" fill="#1c1916"/></g>)}</>},
]
function LuxStylePicker({value,onChange}:{value:LuxStyle;onChange:(v:LuxStyle)=>void}) {
  return <div className="lux-styles" role="radiogroup" aria-label="Door style">{LUX_STYLES.map(s=><button key={s.value} type="button" role="radio" aria-checked={value===s.value} className={value===s.value?'active':''} onClick={()=>onChange(s.value)}><svg viewBox="0 0 32 32" aria-hidden>{s.art}</svg><span>{s.label}</span></button>)}</div>
}
/** Exact sizes of both wardrobe sides (and the corner height) while grouped. */
function LuxSizeModal({sections,maxSide,ceiling,onApply,onClose}:{sections:ReturnType<typeof luxSections>;maxSide:number;ceiling:number;onApply:(p:Record<string,Partial<Furniture>>)=>string|null;onClose:()=>void}) {
  const {a,b,corner}=sections, r=(v?:number)=>String(Math.round((v??0)*10)/10)
  const [vals,setVals]=useState({aw:r(a?.width),ad:r(a?.depth),ah:r(a?.height),bw:r(b?.width),bd:r(b?.depth),bh:r(b?.height),ch:r(corner?.height)})
  const [error,setError]=useState('')
  type K=keyof typeof vals
  const rows:[string,Furniture|undefined,[K,string,number,number][]][]=[
    ['Side A',a,[['aw','Length',60,maxSide],['ad','Depth',35,90],['ah','Height',120,ceiling]]],
    ['Side B',b,[['bw','Length',60,maxSide],['bd','Depth',35,90],['bh','Height',120,ceiling]]],
    ['Corner mirror',corner,[['ch','Height',120,ceiling]]],
  ]
  const submit=()=>{
    for(const [,f,fs] of rows)if(f)for(const [k,label,lo,hi] of fs){const v=Number(vals[k]);if(!Number.isFinite(v)||v<lo||v>hi){setError(`${label} must be between ${lo} and ${Math.round(hi)} cm.`);return}}
    const n=(k:K)=>Number(vals[k]), p:Record<string,Partial<Furniture>>={}
    if(a)p[a.id]={width:n('aw'),depth:n('ad'),height:n('ah')}
    if(b)p[b.id]={width:n('bw'),depth:n('bd'),height:n('bh')}
    if(corner)p[corner.id]={height:n('ch')}
    const err=onApply(p); if(err)setError(err); else onClose()
  }
  return <Modal title="Luxury Wardrobe Sizes" subtitle="Each side keeps its own length, depth and height, in centimeters." onClose={onClose}>
    <form className="modal-body" onSubmit={e=>{e.preventDefault();submit()}} noValidate>
      {rows.filter(([,f])=>f).map(([title,,fs])=><div key={title} className="lux-modal-group"><span className="mini-label">{title}</span><div className="modal-fields">
        {fs.map(([k,label],i)=><label key={k} className="modal-field"><span>{label} <small>(cm)</small></span><input autoFocus={k==='aw'&&i===0} type="number" inputMode="decimal" step="any" value={vals[k]} onChange={e=>{setVals(v=>({...v,[k]:e.target.value}));setError('')}}/></label>)}
      </div></div>)}
      {error&&<div className="modal-error" role="alert"><CircleAlert size={16}/>{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Apply Changes</button></div>
    </form>
  </Modal>
}
function EditSizeModal({item,maxSide,ceiling,onApply,onClose}:{item:Furniture;maxSide:number;ceiling:number;onApply:(w:number,d:number,h:number,arm?:number)=>string|null;onClose:()=>void}) {
  const lShape=isLShape(item)
  const mirror=isMirrorKind(item.kind), roundMirror=item.kind==='mirror-round', roundTable=item.kind==='halo-table'
  const rugCircle=item.kind==='rug'&&item.rugShape==='circle', rug=item.kind==='rug'
  type Key='length'|'width'|'height'|'diameter'|'arm'
  const fields:{key:Key;label:string;hint?:string;lo:number;hi:number}[]=
    lShape?[{key:'width',label:'Side A length',hint:'Along the back wall',lo:80,hi:maxSide},{key:'length',label:'Side B length',hint:'Along the side wall',lo:80,hi:maxSide},{key:'arm',label:'Wardrobe depth',hint:'Front to back of each side',lo:30,hi:100},{key:'height',label:'Height',lo:60,hi:ceiling}]
    :roundMirror?[{key:'diameter',label:'Diameter',lo:10,hi:Math.min(maxSide,ceiling)}]
    :mirror?[{key:'width',label:'Width',hint:'Side to side',lo:10,hi:maxSide},{key:'height',label:'Height',hint:'Mirror height',lo:10,hi:ceiling}]
    :roundTable?[{key:'diameter',label:'Diameter',lo:10,hi:maxSide},{key:'height',label:'Height',lo:1,hi:ceiling}]
    :rugCircle?[{key:'diameter',label:'Diameter',lo:5,hi:maxSide}]
    :rug?[{key:'length',label:'Length',hint:'Front to back',lo:5,hi:maxSide},{key:'width',label:'Width',hint:'Side to side',lo:5,hi:maxSide}]
    :[{key:'length',label:'Length',hint:'Front to back',lo:5,hi:maxSide},{key:'width',label:'Width',hint:'Side to side',lo:5,hi:maxSide},{key:'height',label:'Height',lo:1,hi:ceiling}]
  const r=(v:number)=>String(Math.round(v*10)/10)
  const [vals,setVals]=useState<Record<Key,string>>({length:r(item.depth),width:r(item.width),height:r(item.height),diameter:r(roundMirror?item.width:Math.min(item.width,item.depth)),arm:r(lArm(item))})
  const [error,setError]=useState('')
  const submit=()=>{
    for(const f of fields){const v=Number(vals[f.key]);const msg=!Number.isFinite(v)||v<=0?`${f.label} must be a positive number.`:v<f.lo?`${f.label} must be at least ${f.lo} cm.`:v>f.hi?`${f.label} cannot exceed ${Math.round(f.hi)} cm.`:'';if(msg){setError(msg);return}}
    const n=(k:Key)=>Number(vals[k])
    let w=item.width,d=item.depth,h=item.height
    if(roundMirror){w=h=n('diameter')}
    else if(mirror){w=n('width');h=n('height');d=item.mount?mirrorDepth(item.mount,h):d}
    else if(roundTable){w=d=n('diameter');h=n('height')}
    else if(rugCircle){w=d=n('diameter')}
    else {d=n('length');w=n('width');if(!rug)h=n('height')}
    if(lShape&&n('arm')>Math.min(w,d)-20){setError('Wardrobe depth must be at least 20 cm less than the shorter side.');return}
    const res=onApply(w,d,h,lShape?n('arm'):undefined)
    if(res)setError(res); else onClose()
  }
  return <Modal title={`Edit ${item.name} Dimensions`} subtitle="Exact sizes in centimeters." onClose={onClose}>
    <form className="modal-body" onSubmit={e=>{e.preventDefault();submit()}}>
      <div className="modal-fields">
        {fields.map((f,i)=><label key={f.key} className="modal-field"><span>{f.label} <small>(cm)</small></span><input autoFocus={i===0} type="number" inputMode="decimal" step="any" value={vals[f.key]} onChange={e=>{setVals(v=>({...v,[f.key]:e.target.value}));setError('')}}/>{f.hint&&<em>{f.hint}</em>}</label>)}
      </div>
      {error&&<div className="modal-error" role="alert"><CircleAlert size={16}/>{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Apply Changes</button></div>
    </form>
  </Modal>
}
export default function App() {
  const [boot]=useState(loadStudio)
  const [studio,setStudio]=useState<Studio>(boot.studio)
  const [isNew,setIsNew]=useState(!!boot.isNew)
  const [home,setHome]=useState(true)
  // Welcome sequence (splash -> "Take the Tour" invitation -> tour or My Spaces)
  // plays on the first load and then once every 5 loads; see SPLASH_THIS_LOAD.
  const [splash,setSplash]=useState(SPLASH_THIS_LOAD),[invite,setInvite]=useState(false),[tour,setTour]=useState(false),[helpMenu,setHelpMenu]=useState(false)
  const invited=useRef(false)
  const splashLeave=()=>{if(!invited.current){invited.current=true;setInvite(true)}}
  const splashDone=()=>setSplash(false)
  useEffect(()=>{if(!SPLASH_THIS_LOAD)return;const t=setTimeout(()=>{splashLeave();setSplash(false)},6000);return()=>clearTimeout(t)},[]) // never get stuck on the splash
  const finishTour=(status:OnboardingStatus)=>{writeOnboarding(status);setTour(false)}
  const replayTour=()=>{setHelpMenu(false);setPanel(null);setTour(true)}
  const inviteTour=()=>{setInvite(false);setTour(true)}
  const inviteSkip=()=>{setInvite(false);if(!readOnboarding())writeOnboarding('skipped')}
  const onboarding=<>{tour&&<OnboardingTour onFinish={finishTour}/>}{invite&&<WelcomeInvite onTour={inviteTour} onSkip={inviteSkip}/>}{splash&&<WelcomeSplash onLeave={splashLeave} onDone={splashDone}/>}</>
  const project=activeRoom(studio)
  /** Replaces the active room only; every other room is left untouched. */
  const setProject=(next:Project|((prev:Project)=>Project))=>setStudio(s=>{
    const cur=activeRoom(s), n=typeof next==='function'?next(cur):next, now=Date.now()
    const room:Project={...n,id:cur.id,updatedAt:now,layouts:n.layouts.map(l=>l.id===n.activeLayoutId?{...l,updatedAt:now}:l)}
    return {...s,updatedAt:now,rooms:s.rooms.map(r=>r.id===cur.id?room:r)}
  })
  const [saveState,setSaveState]=useState<SaveState>('saving')
  const [roomsOpen,setRoomsOpen]=useState(false),[newRoomOpen,setNewRoomOpen]=useState(false),[designMenu,setDesignMenu]=useState(false)
  const [wallChange,setWallChange]=useState<{wall:WallName;type:WallType;issues:string[]}|null>(null)
  const [unit,setUnit]=useState<Unit>('cm'),[query,setQuery]=useState('')
  const importMode=useRef<ImportMode>('project')
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [editMode,setEditMode]=useState<'move'|'resize'>('move')
  useEffect(()=>{setEditMode('move')},[selectedId,project.id])
  const [view,setView]=useState<'2d'|'3d'>('2d'), [camera,setCamera]=useState<CameraView>('overview'),[viewReset,setViewReset]=useState(0),[openDoors,setOpenDoors]=useState<Record<string,boolean>>({})
  const [grid,setGrid]=useState(true),[snap,setSnap]=useState(true)
  // UI preferences live under their own key so they can never affect saved rooms/designs.
  const [prefs,setPrefs]=useState<{measureMode:MeasureMode;export:ExportPrefs}>(()=>{
    try{const p=JSON.parse(localStorage.getItem('roomform-prefs')??'null');if(p&&['off','selected','all'].includes(p.measureMode))return {measureMode:p.measureMode,export:{...defaultExportPrefs,...p.export,include:{...defaultExportPrefs.include,...p.export?.include}}}}catch{/* defaults */}
    return {measureMode:'selected',export:defaultExportPrefs}
  })
  useEffect(()=>{try{localStorage.setItem('roomform-prefs',JSON.stringify(prefs))}catch{/* optional */}},[prefs])
  const measureMode=prefs.measureMode
  const [exportOpen,setExportOpen]=useState(false)
  const [toast,setToast]=useState<{message:string;tone:'info'|'success'|'error'}|null>(null),[showExport,setShowExport]=useState(false)
  /** Ordinary feedback is a small toast; pass 'error' for failures. */
  const setNotice=(message:string,tone:'info'|'success'|'error'='info')=>setToast(message?{message,tone}:null)
  const dialogs=useDialogs()
  // Mobile: which bottom sheet is open (furniture library, properties, or the main menu).
  const [panel,setPanel]=useState<null|'library'|'inspector'|'menu'>(null)
  const [isMobile,setIsMobile]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 820px)').matches)
  useEffect(()=>{const mq=window.matchMedia('(max-width: 820px)');const on=()=>{setIsMobile(mq.matches);if(!mq.matches)setPanel(null)};return onMediaChange(mq,on)},[])
  const [sizeOpen,setSizeOpen]=useState(false)
  const [roomDraft,setRoomDraft]=useState({width:String(boot.studio.rooms[0].room.width),depth:String(boot.studio.rooms[0].room.depth),ceiling:String(boot.studio.rooms[0].room.ceiling)})
  const [roomError,setRoomError]=useState('')
  const [roomConfirm,setRoomConfirm]=useState<{project:Project;overlapping:string[];moved:number}|null>(null)
  const [wallTarget,setWallTarget]=useState<'all'|WallName>('all')
  const importRef=useRef<HTMLInputElement>(null), past=useRef<Project[]>([]),future=useRef<Project[]>([])
  const layout=activeLayout(project), furniture=layout?.furniture??[], selected=furniture.find(f=>f.id===selectedId)
  const {width:RW,depth:RD,ceiling:RC}=project.room
  useEffect(()=>{
    if(isNew)return
    setSaveState('saving')
    const t=setTimeout(()=>setSaveState(saveStudio(studio)?'saved':'error'),450)
    return()=>clearTimeout(t)
  },[studio,isNew])
  useEffect(()=>{if(boot.message)setNotice(boot.message)},[boot])
  // Switching rooms: fresh selection, history, door state and view.
  useEffect(()=>{setSelectedId(null);past.current=[];future.current=[];setOpenDoors({})},[project.id])
  useEffect(()=>{setRoomDraft({width:String(fromCm(RW,unit)),depth:String(fromCm(RD,unit)),ceiling:String(fromCm(RC,unit))});setRoomError('')},[RW,RD,RC,unit])
  useEffect(()=>{if(!selected)setSizeOpen(false)},[selected])
  const checkpoint=()=>{past.current.push(copy(project));if(past.current.length>80)past.current.shift();future.current=[]}
  const update=(fn:(draft:Project)=>void,record=true)=>{if(record)checkpoint();setProject(prev=>{const draft=copy(prev);fn(draft);return draft})}
  const updateFurniture=(item:Furniture,record=true)=>{
    let fitted=clampInside(item,project)
    if(!fitted){setNotice(`${item.name} cannot fit inside the room at that size and angle.`);return false}
    const previous=furniture.find(f=>f.id===item.id)
    let support=findSupport(fitted,furniture.filter(f=>f.id!==item.id))
    if(support&&support.height+fitted.height>RC){support=undefined;if(previous?.supportId){setNotice(`${item.name} would be taller than the ceiling on that surface.`);return false}}
    if(support&&support.id!==previous?.supportId&&fitted.kind==='tv-stand')fitted={...fitted,rotation:support.rotation+180}
    fitted={...fitted,supportId:support?.id}
    if(!support&&furniture.some(other=>isEligibleSupport(fitted!,other)&&overlaps(fitted!,other))){
      const free=placeNear(fitted,furniture.filter(f=>f.id!==item.id),project)
      if(!free?.free){setNotice(`${item.name} needs a clear floor position or a surface large enough for it.`);return false}
      fitted=free.item
    }
    if(fitted.kind==='tv-stand'&&previous&&fitted.width!==previous.width&&fitted.screenInches===previous.screenInches)fitted.screenInches=Math.round(65*fitted.width/145)
    update(d=>{const l=activeLayout(d),before=l.furniture.find(f=>f.id===item.id);l.furniture=l.furniture.map(f=>{
      if(f.id===item.id)return fitted
      if(before&&f.supportId===item.id){const moved=followSupport(f,before,fitted);return canSupport(moved,fitted)?moved:{...moved,supportId:undefined}}
      return f
    })},record)
    return true
  }
  const maxSide=Math.max(RW,RD)
  const members=selected?groupOf(selected,furniture):[]
  const grouped=members.length>1
  /** Replaces several items at once (grouped sofa); every item must stay inside the room. */
  const updateMany=(items:Furniture[],record=true)=>{
    if(items.some(i=>!inside(i,project))){setNotice('That would push part of the sofa through a wall.');return false}
    update(d=>{const l=activeLayout(d);l.furniture=l.furniture.map(f=>items.find(i=>i.id===f.id)??f)},record);return true
  }
  const replaceSet=(remove:Furniture[],add:Furniture[])=>update(d=>{const l=activeLayout(d);l.furniture=[...l.furniture.filter(f=>!remove.some(r=>r.id===f.id)),...add]})
  const updateField=<K extends keyof Furniture>(key:K,value:Furniture[K])=>{
    if(!selected)return
    if(grouped&&(key==='x'||key==='y'||key==='rotation')){
      const moved=key==='rotation'?rotateGroup(members,Number(value)-selected.rotation):translate(members,key==='x'?Number(value)-selected.x:0,key==='y'?Number(value)-selected.y:0)
      const fitted=clampGroup(moved,project); if(!fitted){setNotice('The sofa does not fit in the room at that angle.');return}
      updateMany(fitted);return
    }
    let next={...selected,[key]:value}
    if(selected.kind==='tv-stand') {
      if(key==='height') {const screenHeight=Number(value)-(selected.standHeight??27);if(screenHeight<20)return;next={...next,screenHeight,screenInches:Math.round(Math.hypot(next.width,screenHeight)/2.54)}}
      if(key==='width') next={...next,screenInches:Math.round(Math.hypot(Number(value),selected.screenHeight??84)/2.54)}
    }
    if((key==='width'||key==='depth'||key==='height')&&selected.kind==='haven') next={...resizeModule(selected,key==='width'?Number(value):selected.width,key==='depth'?Number(value):selected.depth,key==='height'?Number(value):selected.height),x:selected.x,y:selected.y}
    if((key==='width'||key==='depth') && (Number(value)<=0 || Number(value)>maxSide)) return
    if(selected.kind==='rug'&&selected.rugShape==='circle'&&(key==='width'||key==='depth')) next={...next,width:Number(value),depth:Number(value)}
    if(selected.kind==='halo-table'&&(key==='width'||key==='depth')) next={...next,width:Number(value),depth:Number(value)}
    if(selected.kind==='mirror-round'&&(key==='width'||key==='height')) next={...next,width:Number(value),height:Number(value)}
    if(isMirrorKind(selected.kind)&&selected.mount&&(key==='height'||key==='width')) next={...next,depth:mirrorDepth(selected.mount,next.height)}
    updateFurniture(next)
  }
  /** Applies the sizes/options chosen in the add popup to a fresh item. */
  const withOptions=(f:Furniture,o?:AddOptions):Furniture=>{
    if(!o)return f
    let g:Furniture={...f,width:o.width,depth:o.depth,height:o.height}
    if(f.kind==='tv-stand'){g.screenHeight=Math.max(20,o.height-(f.standHeight??27));g.screenInches=Math.round(Math.hypot(g.width,g.screenHeight)/2.54)}
    if(f.kind==='rug'){g.rugShape=o.rugShape??'rectangle';if(g.rugShape==='circle')g={...g,width:Math.min(g.width,g.depth),depth:Math.min(g.width,g.depth)}}
    if(isMirrorKind(f.kind)&&o.mount){g.mount=o.mount;g.depth=mirrorDepth(o.mount,g.height);if(o.mount!=='wall')g.wall=undefined}
    if(isLShape(f)&&o.armDepth)g.armDepth=o.armDepth
    return g
  }
  const sizeText=(o?:AddOptions)=>o?(o.rugShape==='circle'||o.width===o.depth&&(o as AddOptions).rugShape!==undefined?`⌀ ${o.width} cm`:`${o.width} × ${o.depth} cm`):''
  const add=(kind:FurnitureKind,x?:number,y?:number,opts?:AddOptions):string|null=>{
    const label=catalog.find(c=>c.kind===kind)?.name??'This item'
    const noFit=`${label}${opts?` at ${sizeText(opts)}`:''} does not fit inside ${project.name} (${RW} × ${RD} cm). Try smaller dimensions.`
    if(kind==='wardrobe-lux'){
      const built=buildLux(0,0,{lengthA:opts?.width,lengthB:opts?.depth,depth:opts?.armDepth,height:opts?.height})
      if(built.some(f=>f.height>RC))return `${label} is taller than the ${RC} cm ceiling.`
      const u0=unionBounds(built)
      let mods=clampGroup(x!==undefined&&y!==undefined?translate(built,x-(u0.minX+u0.maxX)/2,y-(u0.minY+u0.maxY)/2):built,project)
      if(!mods)return noFit
      if(x===undefined){
        const u=unionBounds(mods)
        search: for(let yy=0;yy<RD;yy+=10)for(let xx=0;xx<RW;xx+=10){const t=clampGroup(translate(mods,xx-u.minX,yy-u.minY),project);if(t&&t.every(m=>!doorBlocked(m,project)&&furniture.every(f=>f.kind==='rug'||!overlaps(m,f,4)))){mods=t;break search}}
      }
      const placed=mods
      update(d=>{activeLayout(d).furniture.push(...placed)});setSelectedId(placed[1]?.id??placed[0].id)
      if(placed.some(m=>warnings(m,[...furniture,...placed],project).length))setNotice('Wardrobe added. Review the highlighted placement warning.')
      return null
    }
    if(kind==='haven'){
      // The Cloud Haven sofa arrives as its L-shaped set of separate sections, grouped.
      let built=buildHaven(opts?.chaise==='left'?'l-left':'l-right',x??RW/2,y??RD/2,0,{color:havenColors.Beige,fabric:'flatweave'})
      if(opts&&(opts.width!==320||opts.depth!==195||opts.height!==80))built=scaleGroup(built,opts.width,opts.depth,opts.height)
      let mods=clampGroup(built,project)
      if(!mods)return noFit
      if(x===undefined){
        const u=unionBounds(mods)
        search: for(let yy=0;yy<RD;yy+=10)for(let xx=0;xx<RW;xx+=10){const t=clampGroup(translate(mods,xx-u.minX,yy-u.minY),project);if(t&&t.every(m=>!doorBlocked(m,project)&&furniture.every(f=>f.kind==='rug'||!overlaps(m,f,4)))){mods=t;break search}}
      }
      const placed=mods
      update(d=>{activeLayout(d).furniture.push(...placed)});setSelectedId(placed[0].id)
      if(placed.some(m=>warnings(m,[...furniture,...placed],project).length))setNotice('Sofa added. Review the highlighted placement warning.')
      return null
    }
    if(isMirrorKind(kind)&&(opts?.mount??mirrorSpecs[kind].mounts[0])==='wall'){
      const proto=withOptions({...newFurniture(kind,x??RW/2,y??RD/2),mount:'wall'},opts)
      let placed:Furniture|null=x!==undefined&&y!==undefined?mountNearest(proto,project,{x,y}):null
      if(!placed){ // first spot on a solid wall that clears doors, windows and other mirrors
        search: for(const w of ['top','left','right','bottom'] as WallName[]){const L=wallFrame(w,project).length;for(let a=L/2,k=0;k<40;k++,a=L/2+(k%2?1:-1)*Math.ceil(k/2)*20){const t=mountOnWall(proto,project,w,a);if(t&&!warnings(t,furniture,project).length&&!furniture.some(f=>f.mount==='wall'&&f.wall===w&&Math.abs((f.along??0)-(t.along??0))<(f.width+t.width)/2)){placed=t;break search}}}
        placed=placed??mountOnWall(proto,project)
      }
      if(!placed)return `${label} needs a solid wall at least ${Math.round(proto.width)} cm wide and ${Math.round(proto.height)} cm tall.`
      const item=placed
      update(d=>{activeLayout(d).furniture.push(item)});setSelectedId(item.id);return null
    }
    const outside=isOutdoorKind(kind)&&project.outdoor.visible&&project.outdoor.ground!=='none'
    let item=withOptions(newFurniture(kind,x??RW/2,y??(outside?RD+Math.min(120,project.outdoor.extend.bottom/2):RD/2)),opts)
    if(isMirrorKind(kind)&&!opts)item={...item,depth:mirrorDepth(item.mount??'free',item.height)}
    if(item.height>RC&&!isOutdoorKind(kind))return `${label} (${Math.round(item.height)} cm tall) is taller than the ${RC} cm ceiling.`
    const fitted=clampInside(item,project)
    if(!fitted)return noFit
    item=fitted
    if(x===undefined&&!outside) {
      outer: for(let yy=30;yy<RD;yy+=10)for(let xx=30;xx<RW;xx+=10){const test=clampInside({...item,x:xx,y:yy},project);if(test&&inside(test,project)&&(kind==='rug'||!doorBlocked(test,project))&&furniture.every(f=>kind==='rug'||f.kind==='rug'||!overlaps(test,f,8))){item=test;break outer}}
    }
    if(!outside){
      if(x===undefined&&kind==='tv-stand'){
        const unit=furniture.find(f=>f.kind==='tv-unit')
        if(unit){const centered=clampInside({...item,x:unit.x,y:unit.y,rotation:unit.rotation+180},project);if(centered&&canSupport(centered,unit))item=centered}
      }
      const support=findSupport(item,furniture)
      if(support&&support.height+item.height<=RC)item={...item,supportId:support.id,rotation:kind==='tv-stand'?support.rotation+180:item.rotation}
      else if(furniture.some(other=>isEligibleSupport(item,other)&&overlaps(item,other))){const free=placeNear({...item,supportId:undefined},furniture,project);if(free?.free)item=free.item}
    }
    update(d=>{activeLayout(d).furniture.push(item)});setSelectedId(item.id)
    if(warnings(item,[...furniture,item],project).length)setNotice('Item added. Review the highlighted placement warning.')
    return null
  }
  const [addDraft,setAddDraft]=useState<{kind:FurnitureKind;x?:number;y?:number}|null>(null)
  /** Popup "Add to Room": place with the chosen size, select it, ready to drag. */
  const addFromDraft=(o:AddOptions)=>{
    if(!addDraft)return null
    const err=add(addDraft.kind,addDraft.x,addDraft.y,o)
    if(err)return err
    setAddDraft(null);if(isMobile)setPanel(null);setView('2d')
    return null
  }
  const duplicate=()=>{
    if(!selected)return
    if(selected.mount==='wall'){
      const copy=mountOnWall({...selected,id:uid(),name:`${selected.name} copy`},project,selected.wall,(selected.along??0)+selected.width+10)
      if(!copy){setNotice('There is no room on this wall for a copy.');return}
      update(d=>{activeLayout(d).furniture.push(copy)});setSelectedId(copy.id);return
    }
    if(grouped){
      const gid=uid(), copies=members.map(m=>({...m,id:uid(),groupId:gid}))
      for(const [dx,dy] of [[30,30],[-30,30],[30,-30],[-30,-30],[0,0]]){
        const t=clampGroup(translate(copies,dx,dy),project)
        if(t){update(d=>{activeLayout(d).furniture.push(...t)});setSelectedId(t[0].id);if(t.some(m=>warnings(m,[...furniture,...t],project).length))setNotice('The sofa copy overlaps other furniture. Move it to a free spot.');return}
      }
      setNotice('This sofa cannot be duplicated inside the room.');return
    }
    const proto={...selected,id:uid(),name:`${selected.name} copy`,x:selected.x+25,y:selected.y+25,supportId:undefined,...(selected.kind==='wardrobe-lux'?{groupId:undefined,grouped:undefined}:{})}
    const res=isSolid(proto)?placeNear(proto,furniture,project):(()=>{const c=clampInside(proto,project);return c?{item:c,free:true}:null})()
    if(!res){setNotice('This item cannot be duplicated inside the room.');return}
    const item={...res.item,supportId:findSupport(res.item,furniture)?.id}
    update(d=>activeLayout(d).furniture.push(item));setSelectedId(item.id)
    if(!res.free)setNotice('No free spot was found — the copy overlaps another item.')
  }
  const remove=()=>{if(!selected)return;const ids=new Set(members.map(m=>m.id));update(d=>{activeLayout(d).furniture=activeLayout(d).furniture.filter(f=>!ids.has(f.id)).map(f=>ids.has(f.supportId??'')?{...f,supportId:undefined}:f)});setSelectedId(null)}
  const undo=()=>{const prev=past.current.pop();if(!prev)return;future.current.push(copy(project));setProject(prev);setSelectedId(null)}
  const redo=()=>{const next=future.current.pop();if(!next)return;past.current.push(copy(project));setProject(next);setSelectedId(null)}
  const switchLayout=(id:string)=>{update(d=>{d.activeLayoutId=id});setSelectedId(null)}
  const nextDesignName=(d:Project)=>`Design ${String.fromCharCode(65+(d.layouts.length%26))}`
  const newLayout=async()=>{const name=await dialogs.prompt({title:'New Design',message:`Start an empty design in ${project.name}. Walls and openings are shared; furniture and finishes are not.`,label:'Design name',initial:`${nextDesignName(project)} — New option`,confirmLabel:'Create Design'});if(!name)return;const id=uid();update(d=>{d.layouts.push({id,name,furniture:[],appearance:clone(activeLayout(d)?.appearance??defaultAppearance())});d.activeLayoutId=id});setSelectedId(null)}
  const duplicateLayout=()=>{const id=uid();update(d=>{const l=activeLayout(d),ids=new Map(l.furniture.map(f=>[f.id,uid()]));d.layouts.push({id,name:`${l.name} copy`,furniture:l.furniture.map(f=>({...f,id:ids.get(f.id)!,supportId:f.supportId?ids.get(f.supportId):undefined})),appearance:clone(l.appearance)});d.activeLayoutId=id});setSelectedId(null)}
  const saveAsNewDesign=async()=>{const l=layout;const name=await dialogs.prompt({title:'Save as New Design',message:'Creates an independent copy. The current design stays exactly as it is.',label:'Design name',initial:`${nextDesignName(project)} — ${l.name.replace(/^(Design|Layout) [A-Z] — /,'')}`,confirmLabel:'Save Design'});if(!name?.trim())return;const id=uid();update(d=>{const src=activeLayout(d),ids=new Map(src.furniture.map(f=>[f.id,uid()]));d.layouts.push({id,name:name.trim(),furniture:src.furniture.map(f=>({...f,id:ids.get(f.id)!,supportId:f.supportId?ids.get(f.supportId):undefined})),appearance:clone(src.appearance)});d.activeLayoutId=id});setSelectedId(null);setNotice(`Saved as a new design: “${name.trim()}”. The original design is unchanged.`)}
  const renameDesign=async()=>{const name=await dialogs.prompt({title:'Rename Design',message:'Give this design a new name.',label:'Design name',initial:layout.name});if(name&&name!==layout.name){update(d=>{activeLayout(d).name=name});setNotice('Design renamed.','success')}}
  const deleteLayout=async()=>{if(project.layouts.length<=1){setNotice('Keep at least one design in the room.');return}const name=layout.name;if(!await dialogs.confirm({title:'Delete Design?',message:`“${name}” will be permanently removed from ${project.name}. Other designs in this room are not affected.`,confirmLabel:'Delete Design',danger:true}))return;update(d=>{d.layouts=d.layouts.filter(l=>l.id!==d.activeLayoutId);d.activeLayoutId=d.layouts[0].id});setSelectedId(null);setNotice(`Deleted “${name}”.`)}
  const generate=()=>{const result=generateIdeas(project);if(result.layouts.length)update(d=>{d.layouts.push(...result.layouts);d.activeLayoutId=result.layouts[0].id});setSelectedId(null);setNotice(result.error??`Created ${result.layouts.length} distinct layout ideas.`)}
  // ---- rooms
  const openRoom=(id:string)=>{setStudio(s=>({...s,activeRoomId:id}));setRoomsOpen(false);setHome(false);setView('2d')}
  const createNewRoom=(name:string,type:RoomType,dims:Project['room'])=>{
    const room=createRoom(name,type,dims)
    setStudio(s=>({...s,rooms:isNew?[room]:[...s.rooms,room],activeRoomId:room.id,updatedAt:Date.now()}))
    setIsNew(false);setHome(false);setRoomsOpen(false);setView('2d');setNotice(`Created “${name}”. Your other rooms are unchanged.`);return null
  }
  const renameRoom=async(id:string)=>{const r=studio.rooms.find(x=>x.id===id);if(!r)return;const name=await dialogs.prompt({title:'Rename Room',message:'Give your room a new name.',label:'Room name',initial:r.name});if(name&&name!==r.name){setStudio(s=>({...s,rooms:s.rooms.map(x=>x.id===id?{...x,name,updatedAt:Date.now()}:x)}));setNotice('Room renamed.','success')}}
  const duplicateRoom=async(id:string)=>{const r=studio.rooms.find(x=>x.id===id);if(!r)return;const name=await dialogs.prompt({title:'Duplicate Room',message:`Copies ${r.name} with all ${r.layouts.length} design${r.layouts.length===1?'':'s'}. The original stays unchanged.`,label:'Name of the copy',initial:`${r.name} copy`,confirmLabel:'Duplicate Room'});if(!name)return;const c=freshCopy(r,name);setStudio(s=>{const i=s.rooms.findIndex(x=>x.id===id);const rooms=[...s.rooms];rooms.splice(i+1,0,c);return {...s,rooms}});setNotice(`Duplicated “${r.name}” with all ${r.layouts.length} designs.`)}
  const deleteRoom=async(id:string)=>{
    const r=studio.rooms.find(x=>x.id===id);if(!r)return
    if(studio.rooms.length<=1){setNotice('Keep at least one room in the project.');return}
    if(!await dialogs.confirm({title:'Delete Room?',message:`This will permanently remove “${r.name}” and its ${r.layouts.length} saved design${r.layouts.length===1?'':'s'} from this browser's storage. Export it as JSON first if you might need it again.`,confirmLabel:'Delete Room',danger:true}))return
    setStudio(s=>{const rooms=s.rooms.filter(x=>x.id!==id);return {...s,rooms,activeRoomId:s.activeRoomId===id?rooms[0].id:s.activeRoomId}});setNotice(`Deleted “${r.name}”.`)
  }
  // ---- imports never replace existing data: they add new rooms or designs
  const startImport=(mode:ImportMode)=>{importMode.current=mode;setShowExport(false);importRef.current?.click()}
  const importJson=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return
    try {
      const data=JSON.parse(await file.text()), mode=importMode.current
      const rooms:Project[]=data?.kind==='roomform-studio'?normalizeStudio(data).rooms:[normalizeProject(data,true)]
      const taken=new Set(studio.rooms.map(r=>r.name))
      const unique=(n:string)=>{let name=n,i=2;while(taken.has(name))name=`${n} (${i++})`;taken.add(name);return name}
      if(mode==='design'){
        const src=rooms[0], added=[] as Project['layouts']
        for(const l of src.layouts){
          const ids=new Map(l.furniture.map(f=>[f.id,uid()]))
          const items=l.furniture.map(f=>clampInside({...f,id:ids.get(f.id)!,supportId:f.supportId?ids.get(f.supportId):undefined},project))
          if(items.some(i=>!i))throw new Error(`“${l.name}” contains furniture that does not fit in ${project.name} (${RW} × ${RD} cm).`)
          const restored=(items as Furniture[]).map(item=>{const support=items.find(other=>other?.id===item.supportId);return support&&canSupport(item,support)?item:{...item,supportId:undefined}})
          added.push({...l,id:uid(),name:`${l.name} (imported)`,furniture:restored,appearance:clone(l.appearance)})
        }
        update(d=>{d.layouts.push(...added);d.activeLayoutId=added[0].id});setNotice(`Imported ${added.length} design${added.length===1?'':'s'} into “${project.name}”.`)
      } else {
        const copies=rooms.map(r=>freshCopy(r,unique(r.name)))
        setStudio(s=>({...s,rooms:[...s.rooms,...copies],activeRoomId:copies[0].id}))
        setNotice(`Imported ${copies.length} room${copies.length===1?'':'s'} as new ${copies.length===1?'copy':'copies'}. Existing rooms were not changed.`)
      }
    } catch(err){setNotice(err instanceof Error?`Import failed: ${err.message}`:'Could not import this file.','error')}
  }
  const save=()=>{setSaveState('saving');if(saveStudio(studio)){setSaveState('saved');setNotice(`Saved “${layout.name}” in ${project.name}.`,'success')}else{setSaveState('error');setNotice('This browser could not save. Use Export → Entire project JSON to keep your work.','error')}}
  const exportAction=async(kind:'2d'|'3d'|'room'|'project')=>{setShowExport(false);if(kind==='2d'||kind==='3d'){setExportOpen(true);return}else if(kind==='room')exportRoomJson(project);else if(kind==='project')exportStudioJson(studio);else if(!export3D(project))setNotice('Open the 3D view before exporting its screenshot.')}
  const selectedWarnings=selected?warnings(selected,furniture,project):[]
  const rotate90=()=>{
    if(!selected)return
    if(grouped){const t=clampGroup(rotateGroup(members,90),project);if(!t){setNotice('There is not enough space to rotate the sofa here.');return}updateMany(t);return}
    if(selected.mount==='wall'){const w=nextWall(selected,project);const t=w&&mountOnWall(selected,project,w,wallFrame(w,project).length/2);if(!t){setNotice('There is no other solid wall for this mirror.');return}updateFurniture(t);return}
    const fitted=clampInside({...selected,rotation:((selected.rotation+90)%360+360)%360},project)
    if(!fitted){setNotice(`There is not enough space to rotate ${selected.name} here.`);return}
    updateFurniture(fitted)
  }
  const applySize=(w:number,d:number,h:number,arm?:number):string|null=>{
    if(!selected)return null
    if(grouped){
      const before=unionBounds(members), scaled=scaleGroup(members,w,d,h), after=unionBounds(scaled)
      // keep the sofa on its previous centre, then nudge it inside the walls
      const t=clampGroup(translate(scaled,(before.minX+before.maxX-after.minX-after.maxX)/2,(before.minY+before.maxY-after.minY-after.maxY)/2),project)
      if(!t)return `At ${w} × ${d} cm the sofa cannot fit inside the ${RW} × ${RD} cm room at its current angle. Nothing was changed.`
      updateMany(t);return null
    }
    const cand={...resizeModule(selected,w,d,h)}
    if(isLShape(cand))cand.armDepth=arm??Math.min(lArm(selected),Math.min(w,d)-20)
    if(cand.kind==='tv-stand'){cand.screenHeight=Math.max(20,h-(cand.standHeight??27));cand.screenInches=Math.round(Math.hypot(w,cand.screenHeight)/2.54)}
    const others=furniture.filter(f=>f.id!==selected.id)
    const res=isSolid(cand)?placeNear(cand,others,project):(()=>{const c=clampInside(cand,project);return c?{item:c,free:true}:null})()
    if(!res)return `At ${w} × ${d} cm, ${selected.name} cannot fit inside the ${RW} × ${RD} cm room at its current angle. Nothing was changed.`
    updateFurniture(res.item)
    const moved=Math.hypot(res.item.x-selected.x,res.item.y-selected.y)>.5
    if(!res.free)setNotice(`${selected.name} was resized but now overlaps another item.`)
    else if(moved)setNotice(`${selected.name} was moved to the nearest position where it fits.`)
    return null
  }
  const sofaSet=selected?.kind==='haven'?sameGroup(selected,furniture):[]
  const luxSet=selected?.kind==='wardrobe-lux'?sameGroup(selected,furniture):[]
  /** Change sections of the luxury wardrobe; grouped sections stay attached at the corner. */
  const updateLux=(patches:Record<string,Partial<Furniture>>,regroup?:boolean):string|null=>{
    if(!luxSet.length)return null
    const isGrouped=regroup??grouped
    let next=luxSet.map(f=>patches[f.id]?{...f,...patches[f.id]}:f)
    if(isGrouped)next=relayoutLux(next)
    const fitted=isGrouped?clampGroup(next,project):next.map(f=>patches[f.id]?clampInside(f,project):f)
    if(!fitted||fitted.some(f=>!f))return 'That size does not fit inside the room. Nothing was changed.'
    if(fitted.some(f=>f!.height>RC))return `A section would be taller than the ${RC} cm ceiling.`
    updateMany(fitted as Furniture[]);return null
  }
  const setLuxGrouped=(on:boolean)=>{
    const patches=Object.fromEntries(luxSet.map(f=>[f.id,{grouped:on}]))
    const err=updateLux(patches,on); if(err){setNotice(err);return}
    if(on)setNotice('Sections reconnected at the corner and grouped.')
  }
  const luxNum=(v:number,lo:number,hi:number)=>Number.isFinite(v)&&v>=lo&&v<=hi
  /** Sections that belong together (luxury wardrobe, Cloud Haven sofa) can be grouped or split. */
  const groupable=!!selected?.groupId&&sameGroup(selected,furniture).length>1
  const toggleGroup=()=>{if(!selected||!groupable)return;if(selected.kind==='wardrobe-lux')setLuxGrouped(!grouped);else setGrouped(!grouped)}
  /** Door style change: door count is recalculated for the new front (doors? undefined). */
  const setLuxStyle=(f:Furniture,style:LuxStyle)=>{if(luxStyleOf(f)===style&&luxOf(f).style)return;updateLux({[f.id]:{lux:{...luxOf(f),style,doors:undefined}}})}
  const setGrouped=(on:boolean)=>{if(!selected?.groupId)return;const gid=selected.groupId;update(d=>{for(const f of activeLayout(d).furniture)if(f.groupId===gid)f.grouped=on})}
  const sofaLook=(patch:Partial<Pick<Furniture,'color'|'fabric'>>)=>{if(!selected)return;const ids=new Set((sofaSet.length?sofaSet:[selected]).map(f=>f.id));update(d=>{for(const f of activeLayout(d).furniture)if(ids.has(f.id))Object.assign(f,patch)})}
  const setChaise=(side:'left'|'right')=>{if(chaiseSide(sofaSet)===side)return;const t=clampGroup(mirrorGroup(sofaSet),project);if(!t){setNotice('The mirrored sofa does not fit here.');return}updateMany(t)}
  const arrange=(a:Arrangement)=>{
    if(!selected||!sofaSet.length)return
    const u=unionBounds(sofaSet), cx=(u.minX+u.maxX)/2, cy=(u.minY+u.maxY)/2
    const mods=buildHaven(a,cx,cy,selected.rotation,{color:selected.color,fabric:selected.fabric==='tweed'?'tweed':'flatweave',material:selected.material})
    const t=clampGroup(mods,project); if(!t){setNotice('That arrangement does not fit in the room.');return}
    replaceSet(sofaSet,t);setSelectedId(t[0].id)
    if(t.some(m=>warnings(m,[...furniture.filter(f=>!sofaSet.includes(f)),...t],project).length))setNotice('Arrangement applied. Some sections overlap other furniture.')
  }
  const setMount=(mount:MirrorMount)=>{
    if(!selected||selected.mount===mount)return
    const depth=mirrorDepth(mount,selected.height)
    if(mount==='wall'){const t=mountNearest({...selected,mount,depth,elevation:selected.elevation||mirrorSpecs[selected.kind as keyof typeof mirrorSpecs].elevation||20},project,{x:selected.x,y:selected.y});if(!t){setNotice('There is no solid wall for this mirror.');return}updateFurniture(t);return}
    // leaving the wall: stand it on the floor just in front of where it hung
    const wall=selected.mount==='wall'?selected.wall:undefined, off=wall?{top:[0,1],bottom:[0,-1],left:[1,0],right:[-1,0]}[wall]:[0,0]
    const lift=mount==='lean'?depth/2-selected.depth/2:depth/2+12
    updateFurniture({...selected,mount,depth,wall:undefined,x:selected.x+off[0]*lift,y:selected.y+off[1]*lift})
  }
  const toggleArm=(side:'armL'|'armR')=>{if(!selected)return;const hv=hvOf(selected);update(d=>{const f=activeLayout(d).furniture.find(f=>f.id===selected.id);if(f)f.hv={...hv,[side]:!hv[side]}})}
  const applyRoom=()=>{
    const width=toCm(Number(roomDraft.width),unit),depth=toCm(Number(roomDraft.depth),unit),ceiling=toCm(Number(roomDraft.ceiling),unit)
    const {min,max,ceilingMin,ceilingMax}=ROOM_LIMITS
    if(![width,depth,ceiling].every(Number.isFinite)){setRoomError('Enter numbers for every dimension.');return}
    if(width<min||width>max||depth<min||depth>max){setRoomError(`Width and depth must be between ${min} and ${max} cm.`);return}
    if(ceiling<ceilingMin||ceiling>ceilingMax){setRoomError(`Ceiling height must be between ${ceilingMin} and ${ceilingMax} cm.`);return}
    const res=resizeRoom(project,{width,depth,ceiling})
    if('error' in res){setRoomError(res.error);return}
    setRoomError('')
    if(res.overlapping.length){setRoomConfirm(res);return}
    commitRoom(res.project,res.moved)
  }
  const commitRoom=(next:Project,moved:number,done='Room dimensions updated for every design.')=>{checkpoint();setProject(next);setRoomConfirm(null);setNotice(moved?`${done.replace(/\.$/,'')} — ${moved} item${moved===1?' was':'s were'} moved to stay inside.`:done)}
  /** Walls/outdoor changes alter the usable area: re-place furniture in every design. */
  const applyStructural=(fn:(d:Project)=>void)=>{
    const draft=copy(project);fn(draft)
    const err=fitOpenings(draft); if(err){setNotice(err);return}
    const res=resizeRoom(draft,draft.room)
    if('error' in res){setNotice(res.error);return}
    if(res.overlapping.length){setRoomConfirm(res);return}
    commitRoom(res.project,res.moved,'Room updated.')
  }
  const changeWallType=(wall:WallName,type:WallType)=>{
    if(project.walls[wall].type===type)return
    const issues=openingIssues(project,wall,type)
    if(issues.length){setWallChange({wall,type,issues});return}
    applyStructural(d=>{d.walls[wall]={...d.walls[wall],type,thickness:type==='glass'&&d.walls[wall].type==='solid'?6:d.walls[wall].thickness}})
  }
  const confirmWallChange=()=>{
    if(!wallChange)return
    const {wall,type}=wallChange
    applyStructural(d=>{
      d.walls[wall]={...d.walls[wall],type,thickness:type==='glass'&&d.walls[wall].type==='solid'?6:d.walls[wall].thickness}
      if(type==='open')d.doors=d.doors.filter(o=>o.wall!==wall)
      d.windows=d.windows.filter(o=>o.wall!==wall)
      if(d.ac?.wall===wall)d.ac=null
    })
    setWallChange(null)
  }
  const updateOpenings=(fn:(d:Project)=>void)=>{
    const draft=copy(project);fn(draft)
    const err=fitOpenings(draft)
    if(err){setNotice(err);return}
    checkpoint();setProject(draft)
  }
  const wallColor=(wall:'all'|WallName,color:string)=>update(d=>{const walls=activeLayout(d).appearance.walls;if(wall==='all'){for(const key of ['all','top','right','bottom','left'] as const)walls[key]=color}else walls[wall]=color})
  const floorChange=(material:FloorMaterial)=>update(d=>{const floor=activeLayout(d).appearance.floor;if(floor.material===material)return;floor.baseColor=material==='plain'&&floor.material==='plain'?floor.baseColor:floorPresets[material].color;floor.material=material})
  const rugPreset=(width:number,depth:number)=>{if(!selected||selected.kind!=='rug')return;updateFurniture({...selected,width,depth,rugShape:'rectangle'})}
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(anyDialogOpen()||addDraft||exportOpen||sizeOpen||roomConfirm||roomsOpen||newRoomOpen||wallChange)return;const target=e.target as HTMLElement;if(target.closest('input,textarea,select'))return;if(e.key==='Delete'&&selected){e.preventDefault();remove()}else if(e.key==='Escape'&&selected){setSelectedId(null)}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo()}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)})
  const roomDirty=roomDraft.width!==String(fromCm(RW,unit))||roomDraft.depth!==String(fromCm(RD,unit))||roomDraft.ceiling!==String(fromCm(RC,unit))
  const floor=layout.appearance.floor, floorKind=floorPresets[floor.material].kind
  const currentWallColor=layout.appearance.walls[wallTarget]
  if(home)return <>
    <Home rooms={isNew?[]:studio.rooms} activeId={studio.activeRoomId} onContinue={()=>setHome(false)} onCreate={()=>setNewRoomOpen(true)} onOpen={openRoom} onRename={renameRoom} onDuplicate={duplicateRoom} onDelete={deleteRoom} onTour={replayTour}/>
    {newRoomOpen&&<NewRoomModal onCreate={createNewRoom} onClose={()=>setNewRoomOpen(false)}/>}
    {dialogs.element}
    {toast&&<Toast message={toast.message} tone={toast.tone} onClose={()=>setToast(null)}/>}
    {onboarding}
  </>
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><LayoutGrid size={20}/></div><span>roomform</span></div>
      <button className="home-button" onClick={()=>{if(saveStudio(studio))setSaveState('saved');else setSaveState('error');setPanel(null);setHome(true)}} title="My Spaces / Home" aria-label="My Spaces / Home"><House size={16}/> My Spaces</button>
      <nav className="crumbs" aria-label="Current room and design">
        <button className="crumb-rooms" onClick={()=>setRoomsOpen(true)} title="My Rooms"><House size={16}/> My Rooms</button>
        <span className="crumb-sep">/</span>
        <button className="crumb" onClick={()=>setRoomsOpen(true)} title="Switch room"><strong>{project.name}</strong><small>{RW} × {RD} cm</small><ChevronDown size={14}/></button>
        <span className="crumb-sep">/</span>
        <div className="crumb-wrap"><button className="crumb crumb-design" onClick={()=>isMobile?setPanel('menu'):setDesignMenu(v=>!v)} title="Switch design"><strong>{layout.name}</strong><ChevronDown size={14}/></button>
          {designMenu&&<div className="export-menu design-menu" onMouseLeave={()=>setDesignMenu(false)}>
            {project.layouts.map((l,i)=><button key={l.id} className={l.id===project.activeLayoutId?'current':''} onClick={()=>{switchLayout(l.id);setDesignMenu(false)}}><span className="layout-letter small">{String.fromCharCode(65+(i%26))}</span>{l.name}{l.id===project.activeLayoutId&&<Check size={14}/>}</button>)}
            <hr/>
            <button onClick={()=>{setDesignMenu(false);saveAsNewDesign()}}><FilePlus2 size={14}/> Save as new design</button>
            <button onClick={()=>{setDesignMenu(false);duplicateLayout()}}><Copy size={14}/> Duplicate design</button>
            <button onClick={()=>{setDesignMenu(false);renameDesign()}}><Pencil size={14}/> Rename design</button>
            <button onClick={()=>{setDesignMenu(false);deleteLayout()}} disabled={project.layouts.length<=1}><Trash2 size={14}/> Delete design</button>
          </div>}</div>
        <span className={`save-status ${saveState}`} role="status">{saveState==='saving'?<><LoaderCircle size={13} className="spin"/> Saving…</>:saveState==='saved'?<><Check size={13}/> Saved</>:<><CloudOff size={13}/> Not saved</>}</span>
      </nav>
      <button className="mobile-menu-button" onClick={()=>setPanel(p=>p==='menu'?null:'menu')} aria-label="Open menu" aria-expanded={panel==='menu'}><Menu size={20}/></button>
      <div className="top-actions">
        <button className="top-text-button" onClick={()=>setNewRoomOpen(true)}><Plus size={16}/> New Room</button>
        <ActionButton onClick={undo} title="Undo" disabled={!past.current.length}><Undo2 size={18}/></ActionButton>
        <ActionButton onClick={redo} title="Redo" disabled={!future.current.length}><Redo2 size={18}/></ActionButton>
        <button className="top-text-button" onClick={save}><Save size={16}/> Save</button>
        <div className="view-switch"><button className={view==='2d'?'active':''} onClick={()=>setView('2d')}><LayoutGrid size={16}/> 2D</button><button className={view==='3d'?'active':''} onClick={()=>setView('3d')}><View size={16}/> 3D</button></div>
        <div className="export-wrap"><button className="top-text-button" onClick={()=>setHelpMenu(v=>!v)} aria-expanded={helpMenu} aria-haspopup="menu"><CircleHelp size={16}/> Help</button>{helpMenu&&<><button className="home-menu-dismiss" aria-label="Close help menu" onClick={()=>setHelpMenu(false)}/><div className="export-menu help-menu" role="menu"><span className="menu-label">Help</span><button role="menuitem" onClick={replayTour}><Compass size={14}/> Replay introduction</button></div></>}</div>
        <div className="export-wrap"><button className="primary-button" onClick={()=>setShowExport(v=>!v)}><Download size={16}/> Export <ChevronDown size={14}/></button>{showExport&&<div className="export-menu"><span className="menu-label">Export</span><button onClick={()=>exportAction('2d')}>Image (plan, dimensions or 3D)…</button><button onClick={()=>exportAction('room')}>Current room as JSON</button><button onClick={()=>exportAction('project')}>Entire project as JSON</button><hr/><span className="menu-label">Import (adds copies)</span><button onClick={()=>startImport('design')}><Upload size={14}/> Import design</button><button onClick={()=>startImport('room')}><Upload size={14}/> Import room</button><button onClick={()=>startImport('project')}><Upload size={14}/> Import complete project</button></div>}</div>
      </div>
    </header>
    <div className="workspace">
      {panel&&<div className="sheet-backdrop" onClick={()=>setPanel(null)} aria-hidden/>}
      <aside className={`sidebar left-sidebar ${panel==='library'?'sheet-open':''}`} aria-label="Furniture library">
        <div className="sheet-head"><span className="sheet-grip"/><strong>Furniture</strong><button onClick={()=>setPanel(null)} aria-label="Close"><X size={18}/></button></div>
        <div className="side-heading"><span className="eyebrow">YOUR WORKSPACE</span><h2>Furniture library</h2><p>Drag an item onto the plan, or click to add it.</p></div>
        <div className="library-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search furniture, e.g. mirror, Ariika" aria-label="Search furniture"/>{query&&<button onClick={()=>setQuery('')} aria-label="Clear search"><X size={14}/></button>}</div>
        {(()=>{const q=query.trim().toLowerCase();const match=(c:typeof catalog[number])=>!q||`${c.name} ${c.category} ${c.brand??''} ${c.kind}`.toLowerCase().includes(q)
          const groups=CATEGORIES.map(cat=>[cat,catalog.filter(c=>c.category===cat&&match(c))] as const).filter(([,items])=>items.length)
          if(!groups.length)return <p className="library-empty">No furniture matches “{query}”.</p>
          return groups.map(([cat,items])=><div key={cat}><div className="catalog-group">{cat}{cat==='Outdoor Furniture'&&<small>can stand on the outdoor area</small>}</div><div className="catalog-list">{items.map(item=>{const Icon=icons[item.kind];const preview=LibraryPreview({kind:item.kind,color:item.color,accent:item.accent});return <button key={item.kind} className="catalog-item" draggable onDragStart={e=>{e.dataTransfer.setData('application/roomform',item.kind);e.dataTransfer.effectAllowed='copy'}} onClick={()=>setAddDraft({kind:item.kind})}><span className="catalog-icon">{preview??<Icon size={21} strokeWidth={1.65}/>}</span><span className="catalog-copy"><strong>{item.name}</strong><small>{item.kind==='mirror-round'?`⌀ ${item.width} cm`:item.kind==='halo-table'?`⌀ ${item.width} × ${item.height} cm`:item.kind.startsWith('mirror-')?`${item.width} × ${item.height} cm`:`${item.width} × ${item.depth} cm`}</small></span><Plus size={17} className="catalog-plus"/></button>})}</div></div>)})()}
        <div className="layout-section"><div className="section-title"><h3>Designs in {project.name}</h3><ActionButton title="New empty design" onClick={newLayout}><Plus size={17}/></ActionButton></div><p className="section-help">Each design shares this room's walls and openings but keeps its own furniture and finishes.</p>
          <div className="layout-list">{project.layouts.map((l,i)=><button key={l.id} className={`layout-option ${l.id===project.activeLayoutId?'active':''}`} onClick={()=>switchLayout(l.id)}><span className="layout-letter">{String.fromCharCode(65+(i%26))}</span><span><strong>{l.name}</strong><small>{l.furniture.length} items</small></span>{l.id===project.activeLayoutId&&<Check size={16}/>}</button>)}</div>
          <button className="idea-button" onClick={generate}><Sparkles size={17}/> Generate Layout Ideas</button>
          <div className="layout-tools"><button onClick={saveAsNewDesign}><FilePlus2 size={15}/> Save as new</button><button onClick={duplicateLayout}><Copy size={15}/> Duplicate</button><button onClick={deleteLayout}><Trash2 size={15}/> Delete</button></div>
        </div>
      </aside>
      <main className="main-area"><div className={`canvas-header ${isMobile&&view==='3d'?'with-camera':''}`}><div><span className="eyebrow">{project.name.toUpperCase()} · CURRENT DESIGN</span><h1>{layout.name}</h1><p>{RW} × {RD} cm <span>·</span> ceiling {RC} cm <span>·</span> {furniture.length} furniture items</p></div><div className="canvas-header-actions"><button onClick={renameDesign}>Rename design</button>{view==='3d'&&<div className="camera-switch">{([['overview','3D Overview'],['inside','Inside Room'],['top','Top View'],...(project.outdoor.visible&&project.outdoor.ground!=='none'||Object.values(project.walls).some(w=>w.type!=='solid')?[['exterior','Exterior View'] as const]:[])] as const).map(([v,label])=><button key={v} className={camera===v?'active':''} onClick={()=>{setCamera(v);setViewReset(n=>n+1)}}>{isMobile?{overview:'Overview',inside:'Inside',top:'Top',exterior:'Outside'}[v]:label}</button>)}</div>}</div></div>
        <div className="canvas-card">{view==='2d'?<FloorPlan project={project} furniture={furniture} selectedId={selectedId} showGrid={grid} measureMode={measureMode} snap={snap} mobile={isMobile} editMode={editMode} onSelect={setSelectedId} onMove={item=>updateFurniture(item,false)} onMoveMany={items=>updateMany(items,false)} onCommit={checkpoint} onAdd={(kind,x,y)=>setAddDraft({kind,x,y})} onRotate={rotate90} onDuplicate={duplicate} onDelete={remove} onEditSize={()=>setSizeOpen(true)} groupState={groupable?(grouped?'grouped':'ungrouped'):null} onToggleGroup={toggleGroup} openDoors={openDoors}/>:<AppErrorBoundary onRecover={()=>setView('2d')}><Suspense fallback={<div className="view-loading">Loading 3D view…</div>}><Room3D project={project} furniture={furniture} mode={camera} resetKey={viewReset} onReset={()=>setViewReset(n=>n+1)} openDoors={openDoors} onToggleDoor={id=>setOpenDoors(o=>({...o,[id]:!o[id]}))} onToggleAll={()=>setOpenDoors(o=>{const any=project.doors.some(d=>o[d.id]);return Object.fromEntries(project.doors.map(d=>[d.id,!any]))})}/></Suspense></AppErrorBoundary>}</div>
        {isMobile&&view==='2d'&&selected&&<div className="mobile-object-bar" role="toolbar" aria-label={`${selected.name} tools`}>
          <button className={editMode==='move'?'active':''} aria-pressed={editMode==='move'} onClick={()=>setEditMode('move')}><Move size={18}/><span>Move</span></button>
          <button className={editMode==='resize'?'active':''} aria-pressed={editMode==='resize'} disabled={selected.mount==='wall'||grouped} onClick={()=>setEditMode('resize')}><Maximize2 size={18}/><span>Resize</span></button>
          <button onClick={()=>setSizeOpen(true)}><Ruler size={18}/><span>Size</span></button>
          <button onClick={rotate90}><RotateCw size={18}/><span>Rotate</span></button>
          <button onClick={duplicate}><Copy size={18}/><span>Copy</span></button>
          {groupable&&<button onClick={toggleGroup} aria-pressed={grouped}>{grouped?<Ungroup size={18}/>:<Group size={18}/>}<span>{grouped?'Ungroup':'Group'}</span></button>}
          <button className="danger" onClick={remove}><Trash2 size={18}/><span>Delete</span></button>
        </div>}
        <div className="canvas-footer">{view==='2d'?<><button className={grid?'enabled':''} onClick={()=>setGrid(v=>!v)}><Grid3X3 size={16}/> Grid</button><button className={snap?'enabled':''} onClick={()=>setSnap(v=>!v)}><Check size={16}/> Snap to grid & walls</button><div className="measure-switch" role="radiogroup" aria-label="Measurements"><span><Ruler size={15}/> Measurements</span>{(['off','selected','all'] as MeasureMode[]).map(m=><button key={m} role="radio" aria-checked={measureMode===m} className={measureMode===m?'active':''} onClick={()=>setPrefs(p=>({...p,measureMode:m}))}>{m==='off'?'Off':m==='selected'?'Selected':'All'}</button>)}</div></>:<span><View size={16}/> Drag to orbit · Scroll to zoom · Right drag to pan</span>}<span className="scale-note">All dimensions in centimeters</span></div>
      </main>
      <aside className={`sidebar right-sidebar ${panel==='inspector'?'sheet-open':''}`} aria-label={selected?'Furniture properties':'Room settings'}>
        <div className="sheet-head"><span className="sheet-grip"/><strong>{selected?selected.name:'Room settings'}</strong><button onClick={()=>setPanel(null)} aria-label="Close"><X size={18}/></button></div>
        <div className="side-heading settings-heading"><span className="eyebrow">INSPECTOR</span><h2>{selected?'Object settings':'Room settings'}</h2><p>{selected?'Edit this item precisely.':`Shared by every design in ${project.name}.`}</p></div>
        {selected?<div className="settings-content"><div className="selected-preview"><span className="selected-icon">{LibraryPreview({kind:selected.kind,color:selected.color,accent:selected.accent})??(()=>{const Icon=icons[selected.kind];return <Icon size={26}/>})()}</span><div><strong>{selected.name}</strong><small>{catalog.find(c=>c.kind===selected.kind)?.name}</small></div></div>
          {groupable&&<div className="group-switch"><span className="mini-label">Sections</span><Segmented value={grouped?'group':'free'} options={[{value:'group',label:<><Group size={14}/> Grouped</>},{value:'free',label:<><Ungroup size={14}/> Ungrouped</>}]} onChange={v=>{if((v==='group')!==grouped)toggleGroup()}}/><small>{grouped?'All sections move and rotate together.':'Each section moves, rotates and resizes on its own.'}</small></div>}
          <label className="text-field"><span>Furniture name</span><input value={selected.name} onChange={e=>updateField('name',e.target.value)}/></label>
          {!(selected.kind==='wardrobe-lux'&&grouped)&&<div className="field-group"><h3>Dimensions <button className="link-button" onClick={()=>setSizeOpen(true)}><Ruler size={13}/> Exact size</button></h3><div className="field-grid">{selected.kind==='mirror-round'?<NumberField label="Diameter" value={selected.width} min={10} max={RC} onChange={v=>updateField('width',v)}/>
            :isMirrorKind(selected.kind)?<><NumberField label="Width" value={selected.width} min={10} max={maxSide} onChange={v=>updateField('width',v)}/><NumberField label="Height" value={selected.height} min={10} max={RC} onChange={v=>updateField('height',v)}/></>
            :isLShape(selected)?<><NumberField label="Side A" value={selected.width} min={80} max={maxSide} onChange={v=>updateField('width',v)}/><NumberField label="Side B" value={selected.depth} min={80} max={maxSide} onChange={v=>updateField('depth',v)}/><NumberField label="Wardrobe depth" value={lArm(selected)} min={30} max={Math.min(100,Math.min(selected.width,selected.depth)-20)} onChange={v=>updateField('armDepth',v)}/></>
            :(selected.kind==='rug'&&selected.rugShape==='circle')||selected.kind==='halo-table'?<NumberField label="Diameter" value={selected.width} min={10} max={maxSide} onChange={v=>updateField('width',v)}/>
            :<><NumberField label="Width" value={selected.width} min={10} max={maxSide} onChange={v=>updateField('width',v)}/><NumberField label="Length" value={selected.depth} min={10} max={maxSide} onChange={v=>updateField('depth',v)}/></>}
            {selected.kind!=='rug'&&!isMirrorKind(selected.kind)&&<NumberField label="Height" value={selected.height} min={1} max={RC} onChange={v=>updateField('height',v)}/>}</div></div>}
          {selected.kind==='tv-stand'&&<div className="field-group"><h3>TV screen & stand</h3><div className="field-grid">
            <NumberField label="Screen size" value={selected.screenInches??65} min={24} max={120} suffix="in" onChange={inches=>{const width=Math.round(145*inches/65),screenHeight=Math.round(84*inches/65),standHeight=selected.standHeight??27;if(screenHeight+standHeight>RC){setNotice('The TV would be taller than the ceiling.');return}updateFurniture({...selected,width,screenHeight,standHeight,height:screenHeight+standHeight,screenInches:inches})}}/>
            <NumberField label="Screen height" value={selected.screenHeight??84} min={20} max={RC-(selected.standHeight??27)} onChange={screenHeight=>updateFurniture({...selected,screenHeight,height:screenHeight+(selected.standHeight??27),screenInches:Math.round(Math.hypot(selected.width,screenHeight)/2.54)})}/>
            <NumberField label="Stand height" value={selected.standHeight??27} min={5} max={RC-(selected.screenHeight??84)} onChange={standHeight=>updateFurniture({...selected,standHeight,height:(selected.screenHeight??84)+standHeight})}/>
          </div><small className="field-note">Width and length above set the exact screen width and stand footprint.</small>
          {selected.supportId&&<button className="surface-center" onClick={()=>{const support=furniture.find(f=>f.id===selected.supportId);if(support)updateFurniture({...selected,x:support.x,y:support.y,rotation:support.rotation+180})}}>Center on TV unit</button>}</div>}
          {selected.supportId&&<div className="surface-status">Placed on {furniture.find(f=>f.id===selected.supportId)?.name??'supporting furniture'} · {Math.round(furniture.find(f=>f.id===selected.supportId)?.height??0)} cm high</div>}
          {selected.kind==='rug'&&<div className="field-group"><h3>Rug shape & size</h3><Segmented value={selected.rugShape==='circle'?'circle':'rectangle'} options={[{value:'rectangle',label:'Rectangle'},{value:'circle',label:'Circle'}]} onChange={v=>{if(v==='circle')updateFurniture({...selected,rugShape:'circle',width:Math.min(selected.width,selected.depth),depth:Math.min(selected.width,selected.depth)});else updateField('rugShape','rectangle')}}/><div className="rug-presets"><button onClick={()=>rugPreset(200,160)}>200 × 160</button><button onClick={()=>rugPreset(160,230)}>160 × 230</button><button onClick={()=>rugPreset(200,300)}>200 × 300</button></div><small className="field-note">Use the dimension fields above for a custom size.</small></div>}
          {isMirrorKind(selected.kind)&&(()=>{const sp=mirrorSpecs[selected.kind as keyof typeof mirrorSpecs];return <div className="field-group mirror-panel"><h3>Mirror</h3>
            {sp.mounts.length>1&&<><span className="mini-label">Mounting</span><Segmented value={selected.mount??sp.mounts[0]} options={sp.mounts.map(m=>({value:m,label:m==='wall'?'Wall':m==='free'?'Freestanding':'Leaning'}))} onChange={setMount}/></>}
            {selected.mount==='wall'&&<>
              <span className="mini-label">Wall</span><Segmented value={selected.wall??'top'} options={(['top','right','bottom','left'] as WallName[]).map(w=>({value:w,label:project.walls[w].type==='solid'?cap(w):`${cap(w)} ·`}))} onChange={w=>{if(project.walls[w].type!=='solid'){setNotice(`The ${w} side is ${project.walls[w].type==='glass'?'a glass wall':'open'} — mirrors need a solid wall.`);return}const t=mountOnWall(selected,project,w,wallFrame(w,project).length/2);if(t)updateFurniture(t)}}/>
              <div className="field-grid spaced"><NumberField label={`Centre from ${selected.wall==='left'||selected.wall==='right'?'top':'left'}`} value={selected.along??0} min={0} max={Math.max(RW,RD)} onChange={v=>{const t=mountOnWall(selected,project,selected.wall,v);if(t)updateFurniture(t)}}/><NumberField label="Bottom above floor" value={selected.elevation??0} min={0} max={RC} onChange={v=>{const t=mountOnWall({...selected,elevation:v},project);if(t)updateFurniture(t)}}/></div>
            </>}
            <span className="mini-label">Frame</span>
            <div className="material-options">{sp.frames.map(n=><button key={n} className={!selected.frameless&&selected.color===frameColors[n]?'active':''} onClick={()=>update(d=>{const f=activeLayout(d).furniture.find(f=>f.id===selected.id);if(f){f.color=frameColors[n];f.frameless=false}})}><span style={{background:frameColors[n]}}/>{n}</button>)}
              {sp.frameless!=='no'&&<button className={selected.frameless?'active':''} onClick={()=>updateField('frameless',true)}><span style={{background:'linear-gradient(135deg,#eef5f7,#c7dbe1)'}}/>Frameless</button>}</div>
            <label className="color-field"><span>Custom frame color</span><input type="color" value={selected.color} onChange={e=>update(d=>{const f=activeLayout(d).furniture.find(f=>f.id===selected.id);if(f){f.color=e.target.value;f.frameless=false}})}/></label>
            {selected.kind==='mirror-vanity'&&<><span className="mini-label">Corners & lighting</span><div className="segmented"><button className={selected.rounded!==false?'active':''} onClick={()=>updateField('rounded',selected.rounded===false)}>Rounded corners</button><button className={selected.led?'active':''} onClick={()=>updateField('led',!selected.led)}><Lightbulb size={12}/> LED border</button></div></>}
          </div>})()}
          {selected.kind==='lugo-chair'&&<div className="field-group"><h3>Upholstery</h3>
            <Segmented value={(selected.fabric as LugoFabric)??'boucle'} options={(Object.keys(lugoFabrics) as LugoFabric[]).map(f=>({value:f,label:lugoFabrics[f]}))} onChange={v=>updateField('fabric',v)}/>
            <div className="material-options spaced">{Object.entries(lugoColors).map(([n,c])=><button key={n} className={selected.color===c?'active':''} onClick={()=>updateField('color',c)}><span style={{background:c}}/>{n}</button>)}</div>
            <label className="color-field"><span>Custom fabric color</span><input type="color" value={selected.color} onChange={e=>updateField('color',e.target.value)}/></label>
            <label className="color-field"><span>Beech frame tone</span><input type="color" value={selected.accent??'#d2b089'} onChange={e=>updateField('accent',e.target.value)}/></label>
          </div>}
          {(selected.kind==='tv-unit'||selected.kind==='rattan-table'||selected.kind==='halo-table')&&<div className="field-group"><h3>Wood finish</h3>
            <div className="material-options">{Object.entries(woodFinishes).map(([n,c])=><button key={n} className={selected.color===c?'active':''} onClick={()=>updateField('color',c)}><span style={{background:c}}/>{n}</button>)}</div>
            <label className="color-field"><span>Custom wood tone</span><input type="color" value={selected.color} onChange={e=>updateField('color',e.target.value)}/></label>
            {selected.kind!=='halo-table'&&<label className="color-field"><span>Rattan / cane tone</span><input type="color" value={selected.accent??'#d8bd8c'} onChange={e=>updateField('accent',e.target.value)}/></label>}
          </div>}
          {selected.mount!=='wall'&&<div className="field-group"><h3>Position <small>center of item</small></h3><div className="field-grid"><NumberField label="X" value={selected.x} min={0} max={RW} onChange={v=>updateField('x',v)}/><NumberField label="Y" value={selected.y} min={0} max={RD} onChange={v=>updateField('y',v)}/></div></div>}
          {selected.mount!=='wall'&&<div className="field-group"><h3>Rotation</h3><div className="rotation-row"><NumberField label="Angle" value={selected.rotation} min={-360} max={360} suffix="°" onChange={v=>updateField('rotation',v)}/><button title="Rotate 90° clockwise" onClick={rotate90}><RotateCw size={17}/></button></div></div>}
          {selected.kind==='wardrobe-lux'&&(()=>{const secs=luxSections(luxSet), l=luxOf(selected)
            const cornerPicker=(c:Furniture)=><Segmented value={luxMirror(c)?'mirror':'door'} options={[{value:'mirror',label:'Full mirror'},{value:'door',label:'Door'}]} onChange={v=>updateLux({[c.id]:{lux:{...luxOf(c),mirror:v==='mirror'}}})}/>
            const side=(f:Furniture|undefined,label:string)=>f&&<div className="lux-side"><span className="mini-label">{label}</span><div className="field-grid">
              <NumberField label="Length" value={f.width} min={60} max={maxSide} onChange={v=>{if(luxNum(v,60,maxSide)){const e=updateLux({[f.id]:{width:v}});if(e)setNotice(e)}}}/>
              <NumberField label="Depth" value={f.depth} min={35} max={90} onChange={v=>{if(luxNum(v,35,90)){const e=updateLux({[f.id]:{depth:v}});if(e)setNotice(e)}}}/>
              <NumberField label="Height" value={f.height} min={120} max={RC} onChange={v=>{if(luxNum(v,120,RC)){const e=updateLux({[f.id]:{height:v}});if(e)setNotice(e)}}}/>
            </div><LuxStylePicker value={luxStyleOf(f)} onChange={st=>setLuxStyle(f,st)}/></div>
            return <div className="field-group sofa-panel"><h3>Luxury wardrobe <small>{grouped?'sections grouped':'section selected'}</small></h3>
              {grouped&&<>
                {side(secs.a,'Side A')}
                {side(secs.b,'Side B')}
                {secs.corner&&<div className="lux-side"><span className="mini-label">Corner</span><div className="field-grid"><NumberField label="Height" value={secs.corner.height} min={120} max={RC} onChange={v=>{if(luxNum(v,120,RC)){const e=updateLux({[secs.corner!.id]:{height:v}});if(e)setNotice(e)}}}/></div>{cornerPicker(secs.corner)}</div>}
                <button className="link-button lux-exact" onClick={()=>setSizeOpen(true)}><Ruler size={13}/> Exact sizes of both sides</button>
              </>}
              {l.part==='run'&&<>
                <span className="mini-label">Doors on this section</span>
                <div className="field-grid"><NumberField label="Doors" suffix="" value={luxRunDoors(selected)} min={1} max={8} onChange={v=>{if(Number.isInteger(v)&&v>=1&&v<=8)updateLux({[selected.id]:{lux:{...l,doors:v}}})}}/></div>
                {!grouped&&<><span className="mini-label">Door style</span><LuxStylePicker value={luxStyleOf(selected)} onChange={st=>setLuxStyle(selected,st)}/></>}
              </>}
              {l.part==='corner'&&!grouped&&<><span className="mini-label">Corner face</span>{cornerPicker(selected)}</>}
              <small className="field-note">{grouped?'Grouped: move and rotate the whole L together; each side keeps its own size and height.':'Ungrouped: move, rotate and resize this section on its own. Drag sections together to snap them, then choose Group to reconnect the L.'}</small>
            </div>})()}
          {selected.kind==='haven'&&<div className="field-group sofa-panel"><h3>Cloud Haven sofa <small>{grouped?`${members.length} sections grouped`:'section selected'}</small></h3>
            
            {grouped&&chaiseSide(sofaSet)&&<><span className="mini-label">Chaise position</span><Segmented value={chaiseSide(sofaSet)!} options={[{value:'left',label:'Left'},{value:'right',label:'Right'}]} onChange={v=>setChaise(v)}/></>}
            {grouped&&(()=>{const s=groupSize(members);return <div className="sofa-size"><span>Overall</span><strong>{Math.round(s.width)} × {Math.round(s.depth)} × {Math.round(s.height)} cm</strong><button className="link-button" onClick={()=>setSizeOpen(true)}><Ruler size={13}/> Edit</button></div>})()}
            <span className="mini-label">Arrangement</span>
            <div className="arrangements">{([['l-left','L · chaise left'],['l-right','L · chaise right'],['straight','Straight'],['two','Two pieces'],['blocks','Separate blocks']] as [Arrangement,string][]).map(([a,label])=><button key={a} onClick={()=>arrange(a)}>{label}</button>)}</div>
            {!grouped&&<><span className="mini-label">Armrests on this section</span><div className="segmented"><button className={hvOf(selected).armL?'active':''} onClick={()=>toggleArm('armL')}>Left arm</button><button className={hvOf(selected).armR?'active':''} onClick={()=>toggleArm('armR')}>Right arm</button></div></>}
            <span className="mini-label">Fabric</span><Segmented value={(selected.fabric as Fabric)??'flatweave'} options={(Object.keys(fabricNames) as Fabric[]).map(f=>({value:f,label:fabricNames[f]}))} onChange={v=>sofaLook({fabric:v})}/>
            <span className="mini-label">Color</span>
            <div className="material-options">{Object.entries(havenColors).map(([name,color])=><button key={name} title={officialHavenColors.has(name)?'Official color':'Custom visualization color'} className={selected.color===color?'active':''} onClick={()=>sofaLook({color})}><span style={{background:color}}/>{name}{!officialHavenColors.has(name)&&<em className="viz-tag">viz</em>}</button>)}</div>
            <label className="color-field"><span>Custom color</span><input type="color" value={selected.color} onChange={e=>sofaLook({color:e.target.value})}/></label>
            <small className="field-note">Beige, Grey and Off-white match Ariika's listed colors; Mint, Blue and Navy are visualization-only. Separating and rearranging sections is a planning aid; check with the manufacturer whether the real sofa is modular.</small>
          </div>}
          {selected.kind!=='haven'&&!isMirrorKind(selected.kind)&&!['lugo-chair','tv-unit','rattan-table','halo-table'].includes(selected.kind)&&<div className="field-group"><h3>{selected.kind==='rug'||selected.kind==='gaming'?'Color':'Finish'}</h3><div className="material-options">
            {selected.kind==='rug'?Object.entries(rugColors).map(([name,color])=><button key={name} className={selected.color===color?'active':''} onClick={()=>updateField('color',color)}><span style={{background:color}}/>{name}</button>)
            :selected.kind==='gaming'?Object.entries(gamingPresets).map(([name,c])=><button key={name} className={selected.color===c.color&&selected.accent===c.accent?'active':''} onClick={()=>update(d=>{const f=activeLayout(d).furniture.find(f=>f.id===selected.id);if(f){f.color=c.color;f.accent=c.accent}})}><span style={{background:`linear-gradient(135deg, ${c.color} 55%, ${c.accent} 55%)`}}/>{name}</button>)
            :(Object.keys(palette) as Material[]).map(key=><button key={key} className={selected.material===key&&selected.color===palette[key]?'active':''} title={key.replace('-',' ')} onClick={()=>{update(d=>{const f=activeLayout(d).furniture.find(f=>f.id===selected.id);if(f){f.material=key;f.color=palette[key]}})}}><span style={{background:palette[key]}}/>{key.replace('-',' ')}</button>)}
          </div><label className="color-field"><span>Custom color</span><input type="color" value={selected.color} onChange={e=>updateField('color',e.target.value)}/></label>{selected.kind==='gaming'&&<label className="color-field"><span>Accent color</span><input type="color" value={selected.accent??selected.color} onChange={e=>updateField('accent',e.target.value)}/></label>}</div>}
          {!!selectedWarnings.length&&<div className="warning-box"><CircleAlert size={18}/><div><strong>Placement warning</strong>{selectedWarnings.map(w=><p key={w}>{w}</p>)}<small>You can keep this layout if intentional.</small></div></div>}
          <div className="object-actions"><button onClick={duplicate}><Copy size={16}/> Duplicate</button><button className="danger" onClick={remove}><Trash2 size={16}/> Delete</button></div>
        </div>:<div className="settings-content room-settings">
          <div className="room-dims">
            <div className="room-dims-head"><LayoutGrid size={17}/><strong>Room Dimensions</strong><span className="unit-toggle"><Segmented value={unit} options={[{value:'cm',label:'cm'},{value:'m',label:'m'}]} onChange={setUnit}/></span></div>
            <form className="room-dims-grid" onSubmit={e=>{e.preventDefault();applyRoom()}}>
              {(['width','depth','ceiling'] as const).map(key=><label key={key} className="number-field"><span>{key==='ceiling'?'Ceiling':cap(key)}</span><div><input type="number" inputMode="decimal" value={roomDraft[key]} onChange={e=>{setRoomDraft(d=>({...d,[key]:e.target.value}));setRoomError('')}}/><small>{unit}</small></div></label>)}
              {roomDirty&&<div className="room-dims-actions"><button type="button" className="ghost-button" onClick={()=>{setRoomDraft({width:String(fromCm(RW,unit)),depth:String(fromCm(RD,unit)),ceiling:String(fromCm(RC,unit))});setRoomError('')}}>Reset</button><button type="submit" className="primary-button small">Apply</button></div>}
            </form>
            {roomError&&<div className="inline-error"><CircleAlert size={15}/>{roomError}</div>}
          </div>
          <RoomStructure project={project} unit={unit} onOpenings={updateOpenings} onWallType={changeWallType} onStructural={applyStructural}/>
        </div>}
        <div className="appearance-section"><div className="appearance-title"><Paintbrush size={18}/><div><strong>Room Appearance</strong><small>Saved for this design only</small></div></div>
          <div className="field-group"><h3>Walls</h3>
            <div className="wall-targets">{(['all',...WALLS] as const).map(w=><button key={w} className={wallTarget===w?'active':''} onClick={()=>setWallTarget(w)}><span style={{background:layout.appearance.walls[w]}}/>{w==='all'?'All':cap(w)}</button>)}</div>
            <div className="wall-presets">{Object.entries(wallPresets).map(([name,color])=><button key={name} title={name} className={currentWallColor.toLowerCase()===color?'active':''} onClick={()=>wallColor(wallTarget,color)}><span style={{background:color}}/>{name}</button>)}</div>
            <label className="color-field"><span>Custom {wallTarget==='all'?'wall':`${wallTarget} wall`} color</span><input aria-label="Custom wall color" type="color" value={currentWallColor} onChange={e=>wallColor(wallTarget,e.target.value)}/></label>
          </div>
          <div className="field-group"><h3>Flooring</h3>
            <div className="floor-gallery">{(Object.keys(floorPresets) as FloorMaterial[]).map(key=>{const active=floor.material===key;const color=key==='plain'&&active?floor.baseColor:floorPresets[key].color;return <button key={key} className={`floor-card ${active?'active':''}`} onClick={()=>floorChange(key)} aria-pressed={active} title={floorPresets[key].name}>
              <span className="floor-swatch" style={{backgroundImage:`url(${floorDataUrl(key,color)})`}}>{active&&<i><Check size={11} strokeWidth={3}/></i>}</span><span className="floor-name">{floorPresets[key].name}</span></button>})}</div>
            {floorKind==='wood'&&<Segmented value={floor.direction} options={[{value:'horizontal',label:'Horizontal planks'},{value:'vertical',label:'Vertical planks'}]} onChange={v=>update(d=>{activeLayout(d).appearance.floor.direction=v})}/>}
            {floorKind==='plain'&&<label className="color-field"><span>Floor color</span><input aria-label="Floor color" type="color" value={floor.baseColor} onChange={e=>update(d=>{activeLayout(d).appearance.floor.baseColor=e.target.value})}/></label>}
          </div>
        </div>
      </aside>
    </div>
    {isMobile&&<div className={`mobile-menu ${panel==='menu'?'sheet-open':''}`} role="dialog" aria-label="Menu" aria-hidden={panel!=='menu'}>
      <div className="sheet-head"><span className="sheet-grip"/><strong>Menu</strong><button onClick={()=>setPanel(null)} aria-label="Close"><X size={18}/></button></div>
      <div className="mobile-menu-body">
        <div className="menu-row"><button onClick={()=>{setPanel(null);setRoomsOpen(true)}}><House size={17}/> My Rooms</button><button onClick={()=>{setPanel(null);setNewRoomOpen(true)}}><Plus size={17}/> New Room</button></div>
        <div className="menu-row"><button onClick={()=>{save()}}><Save size={17}/> Save now</button><button onClick={undo} disabled={!past.current.length}><Undo2 size={17}/> Undo</button><button onClick={redo} disabled={!future.current.length}><Redo2 size={17}/> Redo</button></div>
        <span className="menu-label">Designs in {project.name}</span>
        <div className="menu-designs">{project.layouts.map((l,i)=><button key={l.id} className={l.id===project.activeLayoutId?'current':''} onClick={()=>{switchLayout(l.id);setPanel(null)}}><span className="layout-letter small">{String.fromCharCode(65+(i%26))}</span><span>{l.name}</span>{l.id===project.activeLayoutId&&<Check size={15}/>}</button>)}</div>
        <div className="menu-grid">
          <button onClick={()=>{setPanel(null);newLayout()}}><Plus size={15}/> New design</button>
          <button onClick={()=>{setPanel(null);saveAsNewDesign()}}><FilePlus2 size={15}/> Save as new</button>
          <button onClick={()=>{setPanel(null);duplicateLayout()}}><Copy size={15}/> Duplicate</button>
          <button onClick={()=>{setPanel(null);renameDesign()}}><PencilIcon size={15}/> Rename</button>
          <button onClick={()=>{setPanel(null);generate()}}><Sparkles size={15}/> Layout ideas</button>
          <button className="danger" onClick={()=>{setPanel(null);deleteLayout()}} disabled={project.layouts.length<=1}><Trash2 size={15}/> Delete</button>
        </div>
        <span className="menu-label">Export</span>
        <div className="menu-grid">
          <button onClick={()=>{setPanel(null);exportAction('2d')}}><Download size={15}/> Image…</button>
          <button onClick={()=>{setPanel(null);exportAction('room')}}><Download size={15}/> Room JSON</button>
          <button onClick={()=>{setPanel(null);exportAction('project')}}><Download size={15}/> Project JSON</button>
        </div>
        <span className="menu-label">Import (adds copies)</span>
        <div className="menu-grid">
          <button onClick={()=>{setPanel(null);startImport('design')}}><UploadIcon size={15}/> Design</button>
          <button onClick={()=>{setPanel(null);startImport('room')}}><UploadIcon size={15}/> Room</button>
          <button onClick={()=>{setPanel(null);startImport('project')}}><UploadIcon size={15}/> Project</button>
        </div>
        <span className="menu-label">Help</span>
        <div className="menu-grid"><button onClick={replayTour}><Compass size={15}/> Replay introduction</button></div>
        <p className="menu-note">Designs are saved in this browser on this device. Use Project JSON to move them between your phone and laptop.</p>
      </div>
    </div>}
    {isMobile&&<nav className="mobile-toolbar" aria-label="Editor tools">
      <button className={panel==='library'?'active':''} onClick={()=>setPanel(p=>p==='library'?null:'library')}><SofaIcon size={20}/><span>Furniture</span></button>
      <button className={panel==='inspector'&&!selected?'active':''} onClick={()=>{setSelectedId(null);setPanel(p=>p==='inspector'&&!selected?null:'inspector')}}><LayoutGrid size={20}/><span>Room</span></button>
      <button aria-label="Undo" onClick={undo} disabled={!past.current.length}><Undo2 size={20}/><span>Undo</span></button>
      <button aria-label="Redo" onClick={redo} disabled={!future.current.length}><Redo2 size={20}/><span>Redo</span></button>
      <button className={panel==='inspector'&&selected?'active':''} disabled={!selected} onClick={()=>setPanel(p=>p==='inspector'?null:'inspector')}><SlidersHorizontal size={20}/><span>Edit</span></button>
      <button onClick={()=>{setView(v=>v==='2d'?'3d':'2d');setPanel(null)}}>{view==='2d'?<View size={20}/>:<LayoutGrid size={20}/>}<span>{view==='2d'?'3D view':'2D plan'}</span></button>
    </nav>}
    <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importJson}/>
    {exportOpen&&<ExportDialog project={project} prefs={prefs.export} onPrefs={e=>setPrefs(p=>({...p,export:e}))} onClose={()=>setExportOpen(false)}
      onDownload2D={async e=>{const ok=await export2D(project,{dimensions:e.kind==='dimensioned',include:e.include,detail:e.detail});if(ok)setNotice('Floor plan image downloaded.','success');else setNotice('The floor plan image could not be created.','error');return ok}}
      onDownload3D={()=>{setExportOpen(false);if(view!=='3d'){setView('3d');setTimeout(()=>{if(!export3D(project))setNotice('Open the 3D view, then export again.','error')},1200)}else if(!export3D(project))setNotice('Open the 3D view before exporting its screenshot.','error')}}/>}
    {addDraft&&<AddFurnitureModal key={addDraft.kind} kind={addDraft.kind} roomName={project.name} maxSide={maxSide} ceiling={RC} preview={LibraryPreview({kind:addDraft.kind,color:catalog.find(c=>c.kind===addDraft.kind)?.color,accent:catalog.find(c=>c.kind===addDraft.kind)?.accent})??(()=>{const Icon=icons[addDraft.kind];return <Icon size={24} strokeWidth={1.6}/>})()} onAdd={addFromDraft} onClose={()=>setAddDraft(null)}/>}
    {sizeOpen&&selected&&selected.kind==='wardrobe-lux'&&grouped&&<LuxSizeModal sections={luxSections(luxSet)} maxSide={maxSide} ceiling={RC} onApply={updateLux} onClose={()=>setSizeOpen(false)}/>}
    {sizeOpen&&selected&&!(selected.kind==='wardrobe-lux'&&grouped)&&<EditSizeModal item={grouped?{...selected,name:'Cloud Haven Sofa',...groupSize(members)}:selected} maxSide={maxSide} ceiling={RC} onApply={applySize} onClose={()=>setSizeOpen(false)}/>}
    {roomConfirm&&<Modal title="Some furniture will overlap" subtitle="The room changed, but not every item could find a free spot." onClose={()=>setRoomConfirm(null)}>
      <div className="modal-body"><p className="modal-text">These items stay inside the walls but will overlap other furniture:</p><ul className="modal-list">{roomConfirm.overlapping.map(n=><li key={n}>{n}</li>)}</ul>
        <div className="modal-actions"><button className="ghost-button" onClick={()=>setRoomConfirm(null)}>Cancel</button><button className="primary-button" onClick={()=>commitRoom(roomConfirm.project,roomConfirm.moved)}>Apply Anyway</button></div></div>
    </Modal>}
    {roomsOpen&&<RoomsPanel rooms={studio.rooms} activeId={project.id} onOpen={openRoom} onRename={renameRoom} onDuplicate={duplicateRoom} onDelete={deleteRoom} onNew={()=>{setRoomsOpen(false);setNewRoomOpen(true)}} onClose={()=>setRoomsOpen(false)}/>}
    {newRoomOpen&&<NewRoomModal onCreate={createNewRoom} onClose={()=>setNewRoomOpen(false)}/>}
    {wallChange&&<Modal title={`Change the ${wallChange.wall} wall to ${wallChange.type==='open'?'an open side':'glass'}?`} subtitle="Some openings on this wall cannot exist on the new wall type." onClose={()=>setWallChange(null)}>
      <div className="modal-body"><p className="modal-text">{wallChange.type==='open'?'An open side has no wall, so these will be removed:':'A glass wall is already glazed, so these will be removed (doors stay):'}</p><ul className="modal-list">{wallChange.issues.map(n=><li key={n}>{n}</li>)}</ul>
        <div className="modal-actions"><button className="ghost-button" onClick={()=>setWallChange(null)}>Keep current wall</button><button className="primary-button" onClick={confirmWallChange}>Change wall</button></div></div>
    </Modal>}
    {dialogs.element}
    {toast&&<Toast message={toast.message} tone={toast.tone} onClose={()=>setToast(null)}/>}
    {onboarding}
  </div>
}
