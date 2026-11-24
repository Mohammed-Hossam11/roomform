import { canSupport, clampInside, findSupport, fitOpenings, interior } from './geometry.ts'
import { buildHaven, clampGroup, HAVEN, type Fabric, type HavenInfo } from './sofa.ts'
import type { MirrorKind } from './parts.ts'
import { clone, uid } from './compat.ts'

export type FurnitureKind = 'bed' | 'wardrobe' | 'desk' | 'bedside' | 'dresser' | 'sofa' | 'shelf' | 'chair' | 'gaming' | 'haven' | 'shoe' | 'rug' | 'custom' | 'monitor' | 'vase' | 'decor'
  | 'outdoor-sofa' | 'garden-chair' | 'outdoor-table' | 'lounger' | 'planter'
  | MirrorKind | 'tv-unit' | 'tv-stand' | 'rattan-table' | 'lugo-chair' | 'halo-table'
  | 'wardrobe-l' | 'wardrobe-l-mirror'
export const OUTDOOR_KINDS: FurnitureKind[] = ['outdoor-sofa', 'garden-chair', 'outdoor-table', 'lounger', 'planter']
export type Material = 'light-wood' | 'walnut' | 'white' | 'grey' | 'black'
export type FloorMaterial = 'light-oak' | 'natural-oak' | 'walnut' | 'grey-wood' | 'white-marble' | 'beige-tiles' | 'grey-tiles' | 'plain'
export type WallName = 'top' | 'right' | 'bottom' | 'left'
export const WALL_NAMES: WallName[] = ['top', 'right', 'bottom', 'left']
export type Appearance = { walls: Record<'all'|WallName,string>; floor: { material: FloorMaterial; baseColor: string; direction: 'horizontal'|'vertical' } }
export const floorPresets: Record<FloorMaterial,{name:string;color:string;kind:'wood'|'tile'|'marble'|'plain'}> = {
  'light-oak':{name:'Light Oak',color:'#d8bd98',kind:'wood'}, 'natural-oak':{name:'Natural Oak',color:'#bd986d',kind:'wood'},
  walnut:{name:'Walnut',color:'#795539',kind:'wood'}, 'grey-wood':{name:'Grey Wood',color:'#a9aaa6',kind:'wood'},
  'white-marble':{name:'White Marble',color:'#e8e9e5',kind:'marble'}, 'beige-tiles':{name:'Beige Tiles',color:'#d9cbb8',kind:'tile'},
  'grey-tiles':{name:'Grey Tiles',color:'#c6c9c8',kind:'tile'}, plain:{name:'Plain Color',color:'#e4dfd6',kind:'plain'},
}
export const wallPresets: Record<string,string> = { White:'#f3f2ee','Warm White':'#ece8df',Cream:'#eee2cf',Beige:'#d8c6ae','Light Grey':'#d5d7d5','Sage Green':'#bac8b5','Dark Grey':'#777c7a' }
export const rugColors: Record<string,string> = { Cream:'#eee5d6', Beige:'#d8c7af', Grey:'#a8aaa8', Brown:'#94775f' }
export const gamingPresets: Record<string,{color:string;accent:string}> = {
  Black:{color:'#2b2d31',accent:'#3d4046'}, White:{color:'#eeede9',accent:'#2b2d31'}, Grey:{color:'#8e9194',accent:'#5d6064'},
  'Blue / Black':{color:'#25272c',accent:'#2f6fd0'}, 'Red / Black':{color:'#25272c',accent:'#c63b3b'},
}
export function defaultAppearance():Appearance { return {walls:{all:'#ece8df',top:'#ece8df',right:'#ece8df',bottom:'#ece8df',left:'#ece8df'},floor:{material:'light-oak',baseColor:floorPresets['light-oak'].color,direction:'horizontal'}} }
export type Furniture = {
  id: string; kind: FurnitureKind; name: string; width: number; depth: number; height: number
  x: number; y: number; rotation: number; color: string; material: Material; rugShape?: 'rectangle'|'circle'; accent?: string
  /** Cloud Haven modular sofa sections */
  hv?: HavenInfo; groupId?: string; grouped?: boolean; fabric?: Fabric | LugoFabric; order?: number
  /** Mirrors: how it stands, and for wall mounting which wall, the centre
   *  position along it (cm from the wall's first corner) and the bottom edge height. */
  mount?: MirrorMount; wall?: WallName; along?: number; elevation?: number
  frameless?: boolean; led?: boolean; rounded?: boolean
  /** TV screen dimensions exclude its two-legged floor stand. */
  screenHeight?: number; standHeight?: number; screenInches?: number
  /** L-shaped corner wardrobes: carcass depth of both arms (cm). `width` is
   *  Side A (along the back), `depth` is Side B (along the left side). */
  armDepth?: number
  /** Optional supporting furniture. Coordinates remain in room centimeters. */
  supportId?: string
}
export type MirrorMount = 'wall' | 'free' | 'lean'
export type LugoFabric = 'boucle' | 'textured' | 'tweed'
export const MIRROR_KINDS: MirrorKind[] = ['mirror-rect', 'mirror-arch', 'mirror-round', 'mirror-oval', 'mirror-wavy', 'mirror-organic', 'mirror-vanity', 'mirror-floor']
export const isMirrorKind = (k: FurnitureKind): k is MirrorKind => (MIRROR_KINDS as string[]).includes(k)
/** Per-mirror options: allowed mountings, frame finishes, default wall height. */
export const mirrorSpecs: Record<MirrorKind, { mounts: MirrorMount[]; frames: string[]; frameless: 'no' | 'option' | 'default'; elevation: number; led?: boolean }> = {
  'mirror-rect': { mounts: ['wall', 'free', 'lean'], frames: ['Black', 'Gold', 'White', 'Wood'], frameless: 'no', elevation: 25 },
  'mirror-arch': { mounts: ['free', 'lean', 'wall'], frames: ['Gold', 'Black', 'Wood'], frameless: 'no', elevation: 25 },
  'mirror-round': { mounts: ['wall'], frames: ['Gold', 'Black', 'White'], frameless: 'option', elevation: 130 },
  'mirror-oval': { mounts: ['wall', 'free'], frames: ['Black', 'Gold', 'White', 'Wood'], frameless: 'no', elevation: 50 },
  'mirror-wavy': { mounts: ['wall', 'free', 'lean'], frames: ['Black', 'Gold', 'White', 'Sage', 'Blush'], frameless: 'default', elevation: 40 },
  'mirror-organic': { mounts: ['wall', 'lean'], frames: ['Wood'], frameless: 'default', elevation: 70 },
  'mirror-vanity': { mounts: ['wall'], frames: ['Black', 'Gold', 'White', 'Wood'], frameless: 'option', elevation: 120, led: true },
  'mirror-floor': { mounts: ['lean', 'free'], frames: ['Black', 'Gold', 'White', 'Wood'], frameless: 'no', elevation: 0 },
}
export const frameColors: Record<string, string> = { Black: '#26282b', Gold: '#c9a35b', White: '#efeeea', Wood: '#b58a5c', Sage: '#a9b8a0', Blush: '#d9b3a6' }
/** Footprint depth a mirror needs on the floor for each mounting. */
export function mirrorDepth(mount: MirrorMount, height: number) { return mount === 'wall' ? 3 : mount === 'lean' ? Math.round(height * Math.sin(8 * Math.PI / 180) + 6) : Math.max(30, Math.round(height * .2)) }
export const woodFinishes: Record<string, string> = { Oak: '#c49a6c', Mahogany: '#7a3b26' }
export const lugoFabrics: Record<LugoFabric, string> = { boucle: 'Bouclé', textured: 'Textured', tweed: 'Tweed' }
export const lugoColors: Record<string, string> = { 'Off-white': '#ece7dc', Beige: '#d8c6aa', Grey: '#a8a6a1', Terracotta: '#b5654a' }
export type Category = 'Beds' | 'Wardrobes & Storage' | 'Desks & Office' | 'Sofas & Seating' | 'Tables' | 'TV Units' | 'Mirrors' | 'Rugs & Carpets' | 'Decor' | 'Outdoor Furniture' | 'Custom Furniture'
export const CATEGORIES: Category[] = ['Beds', 'Wardrobes & Storage', 'Desks & Office', 'Sofas & Seating', 'Tables', 'TV Units', 'Mirrors', 'Rugs & Carpets', 'Decor', 'Outdoor Furniture', 'Custom Furniture']
/** A design (layout): furniture + appearance. Shares its room's geometry. */
export type Layout = { id: string; name: string; furniture: Furniture[]; appearance: Appearance; updatedAt?: number }
/** Openings are positioned along a wall. `start` is measured from the wall's
 *  first corner: the left corner for top/bottom walls, the top corner for
 *  left/right walls. */
export type DoorKind = 'hinged' | 'glass' | 'sliding'
export type Door = { id: string; kind: DoorKind; wall: WallName; start: number; width: number; height: number; hinge: 'start'|'end'; swing: 'in'|'out'; color?: string }
export type WindowSpec = { id: string; wall: WallName; start: number; width: number; sill: number; height: number }
export type AC = { wall: WallName; start: number; width: number; height: number; mount: number }
export type WallType = 'solid' | 'glass' | 'open'
export type GlassFrame = 'none' | 'black' | 'white' | 'aluminum'
export type WallSpec = { type: WallType; thickness: number; frame: GlassFrame }
export type GroundKind = 'none' | 'grass' | 'stone' | 'concrete' | 'decking' | 'tiles'
export type Outdoor = { ground: GroundKind; color: string; visible: boolean; extend: Record<WallName, number> }
export type RoomType = 'standard' | 'living' | 'bedroom' | 'garden' | 'custom'
/** One room. (Named `Project` for historical reasons: before multi-room
 *  support the whole project was a single room.) Room-level: geometry, walls,
 *  openings, outdoor area. Design-level: everything inside `layouts`. */
export type Project = {
  version: 3; id: string; name: string; roomType: RoomType; updatedAt: number
  room: { width: number; depth: number; ceiling: number }
  walls: Record<WallName, WallSpec>
  doors: Door[]; windows: WindowSpec[]; ac: AC | null
  outdoor: Outdoor
  layouts: Layout[]; activeLayoutId: string
}
/** The whole studio: every room, each with its own designs. */
export type Studio = { version: 3; kind: 'roomform-studio'; name: string; rooms: Project[]; activeRoomId: string; updatedAt: number }

export const DOOR_HEIGHT = 210
export const ROOM_LIMITS = { min: 150, max: 3000, ceilingMin: 200, ceilingMax: 800 }
export const groundPresets: Record<GroundKind,{name:string;color:string}> = {
  none:{name:'None',color:'#d9d6cf'}, grass:{name:'Grass',color:'#6f8f4e'}, stone:{name:'Stone Patio',color:'#b9b3a8'},
  concrete:{name:'Concrete',color:'#b4b4b0'}, decking:{name:'Wooden Decking',color:'#9c7a58'}, tiles:{name:'Garden Tiles',color:'#c9bfae'},
}
export const roomTypes: Record<RoomType,{name:string;width:number;depth:number;ceiling:number}> = {
  standard:{name:'Standard Indoor Room',width:400,depth:400,ceiling:270},
  living:{name:'Living Room',width:600,depth:450,ceiling:280},
  bedroom:{name:'Bedroom',width:520,depth:320,ceiling:280},
  garden:{name:'Garden Room',width:1000,depth:500,ceiling:300},
  custom:{name:'Custom Room',width:500,depth:400,ceiling:270},
}

export { uid }
export const palette: Record<Material, string> = {
  'light-wood': '#cfae83', walnut: '#8b664e', white: '#e8e6e0', grey: '#a6a7a4', black:'#353a3b',
}
export type CatalogItem = { kind: FurnitureKind; name: string; width: number; depth: number; height: number; color: string; material: Material; accent?: string; outdoor?: boolean; category: Category; brand?: string; extra?: Partial<Furniture> }
export const catalog: CatalogItem[] = [
  { kind: 'bed', name: 'Bed', width: 160, depth: 200, height: 55, color: '#d4b795', material: 'light-wood', category: 'Beds' },
  { kind: 'wardrobe', name: 'Wardrobe', width: 200, depth: 60, height: 230, color: '#b9a18a', material: 'light-wood', category: 'Wardrobes & Storage' },
  { kind: 'wardrobe-l', name: 'L-Shaped Wardrobe', width: 200, depth: 200, height: 240, color: '#e8dfcf', accent: '#9a7552', material: 'light-wood', category: 'Wardrobes & Storage', extra: { armDepth: 60 } },
  { kind: 'wardrobe-l-mirror', name: 'L-Shaped Wardrobe with Mirror', width: 200, depth: 200, height: 240, color: '#e8dfcf', accent: '#9a7552', material: 'light-wood', category: 'Wardrobes & Storage', extra: { armDepth: 60 } },
  { kind: 'desk', name: 'Desk', width: 120, depth: 60, height: 75, color: '#b48b68', material: 'walnut', category: 'Desks & Office' },
  { kind: 'bedside', name: 'Bedside table', width: 45, depth: 40, height: 55, color: '#d6b68e', material: 'light-wood', category: 'Tables' },
  { kind: 'dresser', name: 'Dresser', width: 100, depth: 45, height: 85, color: '#c5aa8d', material: 'light-wood', category: 'Wardrobes & Storage' },
  { kind: 'sofa', name: 'Sofa', width: 150, depth: 75, height: 85, color: '#a9aaa1', material: 'grey', category: 'Sofas & Seating' },
  { kind: 'haven', name: 'Cloud Haven L-Sofa', width: HAVEN.width, depth: HAVEN.depth, height: HAVEN.height, color: '#d6c8b3', material: 'grey', category: 'Sofas & Seating', brand: 'Ariika' },
  { kind: 'shelf', name: 'Shelving', width: 90, depth: 35, height: 190, color: '#bd9a70', material: 'light-wood', category: 'Wardrobes & Storage' },
  { kind: 'chair', name: 'Chair', width: 50, depth: 50, height: 85, color: '#a4a8a3', material: 'grey', category: 'Sofas & Seating' },
  { kind: 'gaming', name: 'Gaming chair', width: 70, depth: 70, height: 120, color: '#25272c', accent: '#c63b3b', material: 'black', category: 'Desks & Office' },
  { kind: 'shoe', name: 'Shoe organizer', width: 80, depth: 35, height: 110, color: '#e8e6e0', material: 'white', category: 'Wardrobes & Storage' },
  { kind: 'rug', name: 'Carpet / Rug', width: 200, depth: 160, height: 1, color: '#d8c7af', material: 'light-wood', category: 'Rugs & Carpets' },
  { kind: 'custom', name: 'Custom furniture', width: 80, depth: 60, height: 75, color: '#b8a7a0', material: 'grey', category: 'Custom Furniture' },
  { kind: 'mirror-rect', name: 'Full-length mirror', width: 60, depth: 30, height: 180, color: '#26282b', material: 'black', category: 'Mirrors', extra: { mount: 'free' } },
  { kind: 'mirror-arch', name: 'Arched mirror', width: 70, depth: 31, height: 180, color: '#c9a35b', material: 'light-wood', category: 'Mirrors', extra: { mount: 'lean' } },
  { kind: 'mirror-round', name: 'Round wall mirror', width: 80, depth: 3, height: 80, color: '#c9a35b', material: 'light-wood', category: 'Mirrors', extra: { mount: 'wall' } },
  { kind: 'mirror-oval', name: 'Oval mirror', width: 65, depth: 3, height: 160, color: '#26282b', material: 'black', category: 'Mirrors', extra: { mount: 'wall' } },
  { kind: 'mirror-wavy', name: 'Wavy mirror', width: 70, depth: 3, height: 180, color: '#d9b3a6', material: 'white', category: 'Mirrors', extra: { mount: 'wall', frameless: true } },
  { kind: 'mirror-organic', name: 'Organic mirror', width: 80, depth: 3, height: 150, color: '#b58a5c', material: 'light-wood', category: 'Mirrors', extra: { mount: 'wall', frameless: true } },
  { kind: 'mirror-vanity', name: 'Vanity mirror', width: 90, depth: 3, height: 70, color: '#efeeea', material: 'white', category: 'Mirrors', extra: { mount: 'wall', rounded: true, led: false } },
  { kind: 'mirror-floor', name: 'Leaning floor mirror', width: 75, depth: 31, height: 180, color: '#b58a5c', material: 'light-wood', category: 'Mirrors', extra: { mount: 'lean' } },
  { kind: 'tv-unit', name: 'Ariika Japanese TV Unit', width: 180, depth: 40, height: 50, color: '#c49a6c', accent: '#d8bd8c', material: 'light-wood', category: 'TV Units', brand: 'Ariika' },
  { kind: 'tv-stand', name: 'TV with Stand', width: 145, depth: 32, height: 111, color: '#202428', material: 'black', category: 'TV Units', extra: { screenHeight: 84, standHeight: 27, screenInches: 65 } },
  { kind: 'monitor', name: 'Desk Monitor', width: 55, depth: 18, height: 42, color: '#252c32', material: 'black', category: 'Desks & Office' },
  { kind: 'vase', name: 'Decorative Vase', width: 18, depth: 18, height: 32, color: '#d7c5af', material: 'light-wood', category: 'Decor' },
  { kind: 'decor', name: 'Decorative Object', width: 20, depth: 16, height: 18, color: '#b5bbae', material: 'grey', category: 'Decor' },
  { kind: 'rattan-table', name: 'Ariika Rattan Middle Table', width: 120, depth: 60, height: 42, color: '#c49a6c', accent: '#d8bd8c', material: 'light-wood', category: 'Tables', brand: 'Ariika' },
  { kind: 'lugo-chair', name: 'Ariika Lugo Chair', width: 60, depth: 68, height: 75, color: '#ece7dc', accent: '#d2b089', material: 'light-wood', category: 'Sofas & Seating', brand: 'Ariika', extra: { fabric: 'boucle' } },
  { kind: 'halo-table', name: 'Ariika Halo Side Table', width: 40, depth: 40, height: 51, color: '#d2b089', material: 'light-wood', category: 'Tables', brand: 'Ariika' },
  { kind: 'outdoor-sofa', name: 'Outdoor sofa', width: 190, depth: 80, height: 75, color: '#8a7a68', accent: '#e6e1d6', material: 'walnut', outdoor: true, category: 'Outdoor Furniture' },
  { kind: 'garden-chair', name: 'Garden chair', width: 60, depth: 62, height: 85, color: '#8a7a68', accent: '#e6e1d6', material: 'walnut', outdoor: true, category: 'Outdoor Furniture' },
  { kind: 'outdoor-table', name: 'Outdoor table', width: 160, depth: 90, height: 74, color: '#9c7a58', material: 'light-wood', outdoor: true, category: 'Outdoor Furniture' },
  { kind: 'lounger', name: 'Sun lounger', width: 70, depth: 195, height: 35, color: '#e9e5dc', accent: '#9c7a58', material: 'white', outdoor: true, category: 'Outdoor Furniture' },
  { kind: 'planter', name: 'Plant / Planter', width: 50, depth: 50, height: 110, color: '#6b8a4a', accent: '#8c8279', material: 'grey', outdoor: true, category: 'Outdoor Furniture' },
]
export const isOutdoorKind = (k: FurnitureKind) => OUTDOOR_KINDS.includes(k)
export function newFurniture(kind: FurnitureKind, x: number, y: number): Furniture {
  const item = catalog.find(c => c.kind === kind) ?? catalog.find(c=>c.kind==='custom')!
  const { outdoor: _o, category: _c, brand: _b, extra, ...rest } = item; void _o; void _c; void _b
  const f: Furniture = { ...rest, ...extra, id: uid(), x, y, rotation: 0, ...(kind==='rug'?{rugShape:'rectangle' as const}:{}) }
  if (isMirrorKind(kind)) { f.elevation = mirrorSpecs[kind].elevation; f.frameless = extra?.frameless ?? false }
  return f
}
const f = (kind: FurnitureKind, x: number, y: number, rotation = 0) => ({ ...newFurniture(kind, x, y), rotation })
export const solidWall = (thickness = 9): WallSpec => ({ type: 'solid', thickness, frame: 'black' })
export const defaultWalls = (): Record<WallName, WallSpec> => ({ top: solidWall(), right: solidWall(), bottom: solidWall(), left: solidWall() })
export const defaultOutdoor = (): Outdoor => ({ ground: 'none', color: groundPresets.grass.color, visible: false, extend: { top: 200, right: 200, bottom: 300, left: 200 } })
export const newDoor = (p: Partial<Door> = {}): Door => ({ id: uid(), kind: 'hinged', wall: 'top', start: 40, width: 90, height: DOOR_HEIGHT, hinge: 'end', swing: 'in', color: '#ece6dc', ...p })
export const newWindow = (p: Partial<WindowSpec> = {}): WindowSpec => ({ id: uid(), wall: 'left', start: 60, width: 120, sill: 85, height: 125, ...p })
export function defaultOpenings() {
  return {
    doors: [newDoor({ wall: 'top', start: 368, width: 90, hinge: 'end', swing: 'in' })],
    windows: [newWindow({ wall: 'left', start: 108, width: 112, sill: 82, height: 125 })],
    ac: { wall: 'left', start: 101.5, width: 75, height: 30, mount: 212 } as AC,
  }
}
function baseRoom(name: string, roomType: RoomType, room: Project['room'], layouts: Layout[]): Project {
  return { version: 3, id: uid(), name, roomType, updatedAt: Date.now(), room, walls: defaultWalls(), ...defaultOpenings(), outdoor: defaultOutdoor(), layouts, activeLayoutId: layouts[0].id }
}
export function initialProject(): Project {
  const layouts: Layout[] = [
    { id: uid(), name: 'Layout A — Bed on Bottom Wall', furniture: [f('bed', 160, 215), f('wardrobe', 112, 48), f('desk', 432, 248)], appearance:defaultAppearance() },
    { id: uid(), name: 'Layout B — Bed on Right Wall', furniture: [f('bed', 415, 210, 90), f('wardrobe', 118, 278), f('desk', 84, 70)], appearance:defaultAppearance() },
    { id: uid(), name: 'Layout C — Bed Near Window', furniture: [f('bed', 125, 160), f('wardrobe', 310, 275), f('desk', 450, 160)], appearance:defaultAppearance() },
    { id: uid(), name: 'Layout D — Open Center', furniture: [f('bed', 100, 213), f('wardrobe', 165, 45), f('desk', 448, 244)], appearance:defaultAppearance() },
  ]
  const project = baseRoom('My bedroom', 'bedroom', { width: 520, depth: 320, ceiling: 280 }, layouts)
  for (const l of project.layouts) l.furniture = l.furniture.map(it => clampInside(it, project) ?? it)
  return project
}
/** A fresh room for the New Room dialog. Presets only set starting values. */
export function createRoom(name: string, roomType: RoomType, room: Project['room']): Project {
  const appearance = defaultAppearance()
  const W = room.width, D = room.depth
  const p = baseRoom(name, roomType, room, [{ id: uid(), name: 'Design A', furniture: [], appearance }])
  p.ac = null
  p.doors = [newDoor({ wall: 'top', start: Math.max(30, W - 140), width: 90, hinge: 'end' })]
  p.windows = [newWindow({ wall: 'left', start: Math.max(20, D / 2 - 60), width: Math.min(120, D - 60) })]
  if (roomType === 'garden') {
    // Three solid walls and a full-height framed glass front with a sliding door; lawn outside.
    p.walls.bottom = { type: 'glass', thickness: 6, frame: 'black' }
    p.doors = [newDoor({ kind: 'sliding', wall: 'bottom', start: Math.max(20, W / 2 - 100), width: Math.min(200, W - 60), height: Math.min(240, room.ceiling - 20), hinge: 'start', color: '#2b2d30' })]
    p.windows = [newWindow({ wall: 'left', start: Math.max(20, D / 2 - 60), width: Math.min(120, D - 60), sill: 90, height: 120 })]
    p.outdoor = { ground: 'grass', color: groundPresets.grass.color, visible: true, extend: { top: 150, right: 300, bottom: 600, left: 300 } }
    appearance.floor = { material: 'natural-oak', baseColor: floorPresets['natural-oak'].color, direction: 'horizontal' }
    appearance.walls = { all: '#f3f2ee', top: '#f3f2ee', right: '#f3f2ee', bottom: '#f3f2ee', left: '#f3f2ee' }
  } else if (roomType === 'living') {
    p.windows = [newWindow({ wall: 'bottom', start: Math.max(20, W / 2 - 90), width: Math.min(180, W - 60), sill: 60, height: 160 })]
  }
  const err = fitOpenings(p)
  if (err) { p.doors = []; p.windows = []; p.ac = null }
  return p
}
export function initialStudio(): Studio {
  const room = initialProject()
  return { version: 3, kind: 'roomform-studio', name: 'My House', rooms: [room], activeRoomId: room.id, updatedAt: Date.now() }
}
export function activeLayout(project: Project) { return project.layouts.find(l => l.id === project.activeLayoutId) ?? project.layouts[0] }
export function activeRoom(studio: Studio) { return studio.rooms.find(r => r.id === studio.activeRoomId) ?? studio.rooms[0] }
const validColor=(v:unknown,fallback:string)=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v)?v:fallback
const num=(v:unknown,fallback:number,min=-Infinity,max=Infinity)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:fallback
const wallName=(v:unknown,fallback:WallName):WallName=>v==='top'||v==='right'||v==='bottom'||v==='left'?v:fallback
const str=(v:unknown,fallback:string)=>typeof v==='string'&&v.trim()?v:fallback

/** Reads a single room in any saved format: v1 (fixed 520 × 320, `opening`),
 *  v2 (single `door`/`window`/`ac`) or v3 (multi-opening rooms). Missing fields
 *  receive defaults. Items are never shrunk or dropped while loading saved
 *  data; strict mode (JSON import) rejects data that cannot fit. */
export function normalizeProject(input:unknown,strict=false):Project {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p=input as any
  if (!p || (p.version!==1 && p.version!==2 && p.version!==3) || !p.room || !Array.isArray(p.layouts) || !p.layouts.length) throw new Error('Invalid room data')
  const width=num(p.room.width,NaN,ROOM_LIMITS.min,ROOM_LIMITS.max), depth=num(p.room.depth,NaN,ROOM_LIMITS.min,ROOM_LIMITS.max)
  if (!Number.isFinite(width)||!Number.isFinite(depth)) throw new Error('Invalid room dimensions')
  const ceiling=num(p.room.ceiling,280,ROOM_LIMITS.ceilingMin,ROOM_LIMITS.ceilingMax)
  const defs=defaultOpenings()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readDoor=(d:any,fallback:Door):Door=>({id:str(d?.id,uid()),kind:d?.kind==='glass'||d?.kind==='sliding'?d.kind:'hinged',wall:wallName(d?.wall,fallback.wall),start:num(d?.start,fallback.start,0),width:num(d?.width,fallback.width,40,1000),height:num(d?.height,DOOR_HEIGHT,150,ROOM_LIMITS.ceilingMax),hinge:d?.hinge==='start'?'start':'end',swing:d?.swing==='out'?'out':'in',color:validColor(d?.color,'#ece6dc')})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readWindow=(w:any,fallback:WindowSpec):WindowSpec=>({id:str(w?.id,uid()),wall:wallName(w?.wall,fallback.wall),start:num(w?.start,fallback.start,0),width:num(w?.width,fallback.width,10,3000),sill:num(w?.sill,fallback.sill,0),height:num(w?.height,fallback.height,10)})
  let doors:Door[], windows:WindowSpec[]
  if (Array.isArray(p.doors)) doors=p.doors.map((d:unknown)=>readDoor(d,defs.doors[0]))
  else if (p.door) doors=[readDoor(p.door,defs.doors[0])]
  else if (p.opening) doors=[{...defs.doors[0],start:num(p.opening.start,368,0),width:num(p.opening.width,90,40,300)}]
  else doors=defs.doors
  if (Array.isArray(p.windows)) windows=p.windows.map((w:unknown)=>readWindow(w,defs.windows[0]))
  else windows=[readWindow(p.window,defs.windows[0])]
  const a=p.ac
  const ac:AC|null=a===null?null:!a?defs.ac:typeof a.y==='number'&&a.start===undefined
    ?{...defs.ac,start:num(a.y,139)-num(a.width,75)/2,width:num(a.width,75,10,300),height:num(a.height,30,10,150)}
    :{wall:wallName(a.wall,'left'),start:num(a.start,defs.ac.start,0),width:num(a.width,defs.ac.width,10,300),height:num(a.height,defs.ac.height,10,150),mount:num(a.mount,defs.ac.mount,0)}
  const walls=defaultWalls()
  for (const w of WALL_NAMES) { const s=p.walls?.[w]; if (s) walls[w]={type:s.type==='glass'||s.type==='open'?s.type:'solid',thickness:num(s.thickness,9,2,60),frame:['none','black','white','aluminum'].includes(s.frame)?s.frame:'black'} }
  const od=p.outdoor, dout=defaultOutdoor()
  const outdoor:Outdoor=od?{ground:groundPresets[od.ground as GroundKind]?od.ground:'none',color:validColor(od.color,dout.color),visible:od.visible!==false,extend:Object.fromEntries(WALL_NAMES.map(w=>[w,num(od.extend?.[w],dout.extend[w],0,5000)])) as Record<WallName,number>}:dout
  const roomType:RoomType=roomTypes[p.roomType as RoomType]?p.roomType:'bedroom'
  const project:Project={version:3,id:str(p.id,uid()),name:str(p.name,'My bedroom'),roomType,updatedAt:num(p.updatedAt,Date.now()),room:{width,depth,ceiling},walls,doors,windows,ac,outdoor,layouts:[],activeLayoutId:p.activeLayoutId}
  const openingError=fitOpenings(project)
  if(openingError){
    if(strict) throw new Error(openingError)
    // Keep the room loadable without discarding saved openings silently: fall back only when the
    // saved openings cannot be made valid, and keep a copy of them on the room for reference.
    const kept={doors:project.doors,windows:project.windows,ac:project.ac}
    Object.assign(project,defaultOpenings()); if(fitOpenings(project)){project.doors=[];project.windows=[];project.ac=null}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(project as any).invalidOpenings=kept
  }
  const r=interior(project)
  for(const layout of p.layouts) {
    if(!layout || !Array.isArray(layout.furniture)) throw new Error('Invalid design data')
    const base=defaultAppearance(), ap=layout.appearance
    const appearance:Appearance={walls:{...base.walls,...Object.fromEntries((['all','top','right','bottom','left'] as const).map(k=>[k,validColor(ap?.walls?.[k],base.walls[k])]))},floor:{material:floorPresets[ap?.floor?.material as FloorMaterial]?ap.floor.material:'light-oak',baseColor:validColor(ap?.floor?.baseColor,base.floor.baseColor),direction:ap?.floor?.direction==='vertical'?'vertical':'horizontal'}}
    const furniture:Furniture[]=[]
    for(const raw of layout.furniture) {
      if(!raw || ![raw.width,raw.depth,raw.x,raw.y,raw.rotation].every(Number.isFinite) || raw.width<=0 || raw.depth<=0) {if(strict)throw new Error('A furniture item has invalid dimensions');continue}
      if((raw.kind==='haven'||raw.kind==='cloud-haven')&&!raw.hv){
        // Older single-object Cloud Haven sofa: convert into its modular sections.
        const mods=buildHaven(raw.chaise==='left'?'l-left':'l-right',raw.x,raw.y,raw.rotation,{color:validColor(raw.color,'#d6c8b3'),fabric:raw.fabric==='tweed'?'tweed':'flatweave'})
        furniture.push(...(clampGroup(mods,project)??mods)); continue
      }
      const kind:FurnitureKind=catalog.some(c=>c.kind===raw.kind)?raw.kind:'custom'
      const accentKinds:FurnitureKind[]=['gaming',...OUTDOOR_KINDS,'tv-unit','rattan-table','lugo-chair','wardrobe-l','wardrobe-l-mirror']
      let item:Furniture={...raw,id:typeof raw.id==='string'?raw.id:uid(),kind,name:typeof raw.name==='string'?raw.name:'Furniture',color:validColor(raw.color,'#b8a7a0'),material:palette[raw.material as Material]?raw.material:'grey',height:Number.isFinite(raw.height)&&raw.height>0?raw.height:75,rugShape:kind==='rug'?(raw.rugShape==='circle'?'circle':'rectangle'):undefined,accent:accentKinds.includes(kind)?validColor(raw.accent,catalog.find(c=>c.kind===kind)?.accent??'#3d4046'):undefined,...(kind==='haven'?{hv:{type:raw.hv?.type==='chaise'?'chaise':'seat',armL:!!raw.hv?.armL,armR:!!raw.hv?.armR,back:Number.isFinite(raw.hv?.back)?raw.hv.back:HAVEN.back,arm:Number.isFinite(raw.hv?.arm)?raw.hv.arm:HAVEN.arm},groupId:typeof raw.groupId==='string'?raw.groupId:undefined,grouped:!!raw.grouped,fabric:raw.fabric==='tweed'?'tweed':'flatweave'}:{hv:undefined,groupId:undefined,grouped:undefined,fabric:kind==='lugo-chair'?raw.fabric:undefined})}
      if(item.kind==='rug'&&item.rugShape==='circle') item={...item,width:Math.min(item.width,item.depth),depth:Math.min(item.width,item.depth)}
      if(isMirrorKind(item.kind)){
        const sp=mirrorSpecs[item.kind], mount:MirrorMount=sp.mounts.includes(raw.mount)?raw.mount:sp.mounts[0]
        item={...item,mount,wall:mount==='wall'?wallName(raw.wall,'top'):undefined,along:num(raw.along,0),elevation:num(raw.elevation,sp.elevation,0),frameless:!!raw.frameless,led:!!raw.led,rounded:raw.rounded!==false}
      } else item={...item,mount:undefined,wall:undefined,along:undefined,elevation:undefined}
      if(item.kind==='lugo-chair') item={...item,fabric:raw.fabric==='tweed'||raw.fabric==='textured'?raw.fabric:'boucle',accent:validColor(raw.accent,'#d2b089')}
      if(item.kind==='halo-table') item={...item,depth:item.width}
      if(item.kind==='wardrobe-l'||item.kind==='wardrobe-l-mirror') item={...item,armDepth:Math.max(30,Math.min(Number.isFinite(raw.armDepth)&&raw.armDepth>0?raw.armDepth:60,Math.min(item.width,item.depth)-10))}
      else item={...item,armDepth:undefined}
      if(item.kind==='tv-unit'||item.kind==='rattan-table') item={...item,accent:validColor(raw.accent,'#d8bd8c')}
      if(item.kind==='tv-stand') {
        const standHeight=Number.isFinite(raw.standHeight)&&raw.standHeight>0?raw.standHeight:27
        const screenHeight=Number.isFinite(raw.screenHeight)&&raw.screenHeight>0?raw.screenHeight:Math.max(20,item.height-standHeight)
        item={...item,standHeight,screenHeight,height:standHeight+screenHeight,screenInches:Number.isFinite(raw.screenInches)&&raw.screenInches>0?raw.screenInches:Math.round(Math.hypot(item.width,screenHeight)/2.54)}
      }
      const fitted=clampInside(item,project)
      if(!fitted) {
        if(strict)throw new Error(`${item.name} is too large to fit inside the ${width} × ${depth} cm room`)
        // Keep oversized saved items untouched so nothing is silently lost; they show a warning.
        furniture.push({...item,x:Math.min(Math.max(item.x,r.left),r.right),y:Math.min(Math.max(item.y,r.top),r.bottom)})
        continue
      }
      furniture.push(fitted)
    }
    for (const item of furniture) {
      const old = furniture.find(other => other.id === item.supportId)
      const support = old && canSupport(item, old) ? old : findSupport(item, furniture)
      item.supportId = support && support.height + item.height <= project.room.ceiling ? support.id : undefined
      if (item.supportId && item.kind === 'tv-stand' && !old) item.rotation = support!.rotation + 180
    }
    project.layouts.push({id:typeof layout.id==='string'?layout.id:uid(),name:typeof layout.name==='string'?layout.name:'Design',furniture,appearance,updatedAt:num(layout.updatedAt,project.updatedAt)})
  }
  if(!project.layouts.some(l=>l.id===project.activeLayoutId)) project.activeLayoutId=project.layouts[0].id
  return project
}
export function normalizeStudio(input:unknown):Studio {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s=input as any
  if(!s||s.kind!=='roomform-studio'||!Array.isArray(s.rooms)||!s.rooms.length) throw new Error('Invalid Roomform project file')
  const rooms:Project[]=[]
  for(const r of s.rooms){ try{rooms.push(normalizeProject(r))}catch{/* skip unreadable room; raw data stays in the backup */} }
  if(!rooms.length) throw new Error('No readable rooms in this project')
  // Ids must be unique so rooms can never overwrite each other.
  const seen=new Set<string>(); for(const r of rooms){ if(seen.has(r.id)) r.id=uid(); seen.add(r.id) }
  return {version:3,kind:'roomform-studio',name:str(s.name,'My House'),rooms,activeRoomId:rooms.some(r=>r.id===s.activeRoomId)?s.activeRoomId:rooms[0].id,updatedAt:num(s.updatedAt,Date.now())}
}

export const STUDIO_KEY='roomform-studio'
export const LEGACY_KEY='roomform-project'
function backup(key:string,raw:string){ try{ localStorage.setItem(`${key}-backup-${Date.now()}`,raw) }catch{/* storage full or unavailable */} }
/** Loads the studio. If only the previous single-room format exists, it is
 *  copied to a timestamped backup first, then migrated into a room of a new
 *  studio. The old key itself is left untouched, so it can always be recovered. */
export function loadStudio(): { studio: Studio; message?: string; isNew?: boolean } {
  let raw: string | null = null
  try { raw = localStorage.getItem(STUDIO_KEY) } catch { return { studio: initialStudio(), isNew: true, message: 'Browser storage is unavailable — use JSON export to keep your work.' } }
  if (raw) {
    try { return { studio: normalizeStudio(JSON.parse(raw)) } }
    catch { backup(STUDIO_KEY, raw) /* fall through to the legacy data, never silently reset */ }
  }
  let legacy: string | null = null
  try { legacy = localStorage.getItem(LEGACY_KEY) } catch { /* ignore */ }
  if (legacy) {
    backup(LEGACY_KEY, legacy)
    try {
      const room = normalizeProject(JSON.parse(legacy))
      const studio: Studio = { version: 3, kind: 'roomform-studio', name: 'My House', rooms: [room], activeRoomId: room.id, updatedAt: Date.now() }
      return { studio, message: raw ? 'Saved projects could not be read; a backup was kept and your previous bedroom was restored.' : `Your saved bedroom and its ${room.layouts.length} designs were moved into “My Rooms”. A backup copy was kept.` }
    } catch { /* fall through */ }
  }
  return { studio: initialStudio(), isNew: true, message: raw || legacy ? 'Saved data could not be read. A backup copy was kept in this browser; create a new room to begin.' : undefined }
}
export function saveStudio(studio: Studio): boolean {
  try { localStorage.setItem(STUDIO_KEY, JSON.stringify(studio)); return true } catch { return false }
}
/** Gives every room/design/item in an imported room fresh ids so it can never collide with existing data. */
export function freshCopy(room: Project, name?: string): Project {
  const c: Project = clone(room)
  c.id = uid(); if (name) c.name = name; c.updatedAt = Date.now()
  const map = new Map<string, string>()
  for (const l of c.layouts) {
    const nid = uid(); if (l.id === room.activeLayoutId) c.activeLayoutId = nid; l.id = nid
    const ids = new Map(l.furniture.map(fu => [fu.id, uid()]))
    l.furniture = l.furniture.map(fu => ({ ...fu, id: ids.get(fu.id)!, supportId: fu.supportId ? ids.get(fu.supportId) : undefined, groupId: fu.groupId ? (map.get(fu.groupId) ?? (map.set(fu.groupId, uid()), map.get(fu.groupId)!)) : undefined }))
  }
  if (!c.layouts.some(l => l.id === c.activeLayoutId)) c.activeLayoutId = c.layouts[0].id
  c.doors = c.doors.map(d => ({ ...d, id: uid() })); c.windows = c.windows.map(w => ({ ...w, id: uid() }))
  return c
}
