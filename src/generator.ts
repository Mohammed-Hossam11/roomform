import { activeLayout, uid, type Furniture, type Layout, type Project } from './model'
import { bounds, canSupport, clampInside, doorBlocked, followSupport, inside, interior, overlaps, snapToWalls } from './geometry'
import { clone } from './compat'

const positions = [
  { name: 'Window side', bed: [112, 175, 0] },
  { name: 'Right wall', bed: [415, 218, 90] },
  { name: 'Bottom wall', bed: [245, 215, 0] },
  { name: 'Corner retreat', bed: [115, 210, 0] },
] as const

function candidates(item: Furniture, project: Project, variant: number): Furniture[] {
  const all: Furniture[]=[]
  const rotations=[item.rotation, (item.rotation+90)%360, 0, 90]
  const seen=new Set<string>()
  for (const rotation of rotations) {
    const proto={...item, rotation}
    const b=bounds({...proto,x:0,y:0})
    const halfW=(b.maxX-b.minX)/2, halfD=(b.maxY-b.minY)/2
    const r=interior(project)
    for (let y=r.top+halfD+2;y<=r.bottom-halfD;y+=12)
      for (let x=r.left+halfW+2;x<=r.right-halfW;x+=12) {
        const key=`${Math.round(x)}:${Math.round(y)}:${rotation}`
        if (!seen.has(key)) { seen.add(key); all.push({...item,x,y,rotation}) }
      }
  }
  // Reference points were designed for a 520 × 320 cm room; scale them to the current room.
  const sx=project.room.width/520, sy=project.room.depth/320
  const preferred = [
    (c: Furniture) => Math.abs(c.x-260*sx)+Math.abs(c.y-45*sy),
    (c: Furniture) => Math.abs(c.x-470*sx)+Math.abs(c.y-250*sy),
    (c: Furniture) => Math.abs(c.x-75*sx)+Math.abs(c.y-65*sy),
    (c: Furniture) => Math.abs(c.x-265*sx)+Math.abs(c.y-270*sy),
  ][variant]
  return all.sort((a,b) => {
    const score=(c:Furniture) => {
      const bb=bounds(c)
      const r=interior(project),wall=Math.min(bb.minX-r.left,bb.minY-r.top,r.right-bb.maxX,r.bottom-bb.maxY)
      const center=Math.max(0,95-Math.hypot(c.x-project.room.width/2,c.y-project.room.depth/2))
      return preferred(c)*0.2 + wall*2 + center*1.5
    }
    return score(a)-score(b)
  })
}

export function generateIdeas(project: Project): { layouts: Layout[]; error?: string } {
  const current=activeLayout(project),source=current.furniture
  if (!source.length) return { layouts: [], error: 'Add at least one furniture item before generating ideas.' }
  const result: Layout[]=[]
  for (let variant=0;variant<4;variant++) {
    const placed: Furniture[]=[]
    const ids=new Map<string,string>()
    const bed=source.find(f=>f.kind==='bed')
    if (bed) {
      const [x,y,rotation]=positions[variant].bed
      const scaled=clampInside({...bed,id:uid(),x:x*project.room.width/520,y:y*project.room.depth/320,rotation},project)
      const proposed=scaled&&clampInside(snapToWalls(scaled,project,60),project)
      if (!proposed || doorBlocked(proposed,project)) continue
      placed.push({...proposed,supportId:undefined});ids.set(bed.id,proposed.id)
    }
    let failed=''
    // Grouped sofa sections are placed as one rigid arrangement.
    const groups=new Map<string,Furniture[]>()
    for (const f of source) if (f.grouped&&f.groupId) groups.set(f.groupId,[...(groups.get(f.groupId)??[]),f])
    for (const [,members] of groups) {
      const r=interior(project), bs=members.map(bounds)
      const u={minX:Math.min(...bs.map(b=>b.minX)),maxX:Math.max(...bs.map(b=>b.maxX)),minY:Math.min(...bs.map(b=>b.minY)),maxY:Math.max(...bs.map(b=>b.maxY))}
      const opts:{dx:number;dy:number;score:number}[]=[]
      for (let y=r.top;y<=r.bottom-(u.maxY-u.minY)+.01;y+=12) for (let x=r.left;x<=r.right-(u.maxX-u.minX)+.01;x+=12) {
        const dx=x-u.minX, dy=y-u.minY, cx=(u.minX+u.maxX)/2+dx, cy=(u.minY+u.maxY)/2+dy
        const wall=Math.min(x-r.left,y-r.top,r.right-(x+u.maxX-u.minX),r.bottom-(y+u.maxY-u.minY))
        opts.push({dx,dy,score:Math.hypot(cx-project.room.width*[.5,.7,.3,.5][variant],cy-project.room.depth*[.75,.5,.5,.25][variant])*.3+wall*2})
      }
      const pick=opts.sort((a,b)=>a.score-b.score).find(o=>members.every(m=>{const c={...m,x:m.x+o.dx,y:m.y+o.dy};return inside(c,project)&&!doorBlocked(c,project)&&placed.every(p=>!overlaps(c,p,8))}))
      if (!pick) { failed=members[0].name; break }
      const gid=uid()
      placed.push(...members.map(m=>{const id=uid();ids.set(m.id,id);return {...m,id,groupId:gid,x:m.x+pick.dx,y:m.y+pick.dy,supportId:undefined}}))
    }
    for (const item of (failed?[]:source).filter(f=>f.id!==bed?.id && f.kind!=='rug' && f.mount!=='wall' && !f.supportId && !(f.grouped&&f.groupId)).sort((a,b)=>b.width*b.depth-a.width*a.depth)) {
      const found=candidates(item,project,variant).find(c=>inside(c,project) && !doorBlocked(c,project) && placed.every(p=>!overlaps(c,p,8)))
      if (!found) { failed=item.name; break }
      const id=uid();ids.set(item.id,id);placed.push({...found,id,supportId:undefined})
    }
    for (const item of failed?[]:source.filter(f=>!!f.supportId)) {
      const before=source.find(f=>f.id===item.supportId),after=placed.find(f=>f.id===ids.get(item.supportId!))
      if(!before||!after){failed=item.name;break}
      const attached={...followSupport(item,before,after),id:uid(),supportId:after.id}
      if(!inside(attached,project)||!canSupport(attached,after)||attached.height+after.height>project.room.ceiling||placed.some(p=>p.id!==after.id&&overlaps(attached,p,1))){failed=item.name;break}
      placed.push(attached)
    }
    if (!failed) {
      const rugs=source.filter(f=>f.kind==='rug'||f.mount==='wall').map(f=>clampInside({...f,id:uid()},project)).filter((f):f is Furniture=>!!f)
      if(placed.length+rugs.length===source.length) result.push({id:uid(),name:`Idea ${result.length+1} — ${positions[variant].name}`,furniture:[...rugs,...placed],appearance:clone(current.appearance)})
    }
  }
  if (!result.length) return { layouts: [], error: 'The current furniture cannot fit around the door with clear gaps. Try reducing an item’s size or removing one.' }
  return { layouts: result, error: result.length<4 ? `Created ${result.length} valid idea${result.length===1?'':'s'}. The other arrangements could not fit every item with door clearance and spacing.` : undefined }
}
