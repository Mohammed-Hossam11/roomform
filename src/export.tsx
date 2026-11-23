import { renderToStaticMarkup } from 'react-dom/server'
import { activeLayout, type Project, type Studio } from './model'
import { exterior } from './geometry'
import { FurnitureArt, FurnitureLabel, PlanDefs, RoomShell } from './PlanArt'

function download(url:string,name:string) { const a=document.createElement('a'); a.href=url; a.download=name; document.body.append(a); a.click(); a.remove() }
function downloadCanvas(canvas:HTMLCanvasElement,name:string) {
  canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);download(url,name);setTimeout(()=>URL.revokeObjectURL(url),60000)},'image/png')
}
function downloadJson(data:unknown,name:string) {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'})
  const url=URL.createObjectURL(blob); download(url,name); setTimeout(()=>URL.revokeObjectURL(url),1000)
}
/** One room with all of its designs. */
export function exportRoomJson(project:Project) { downloadJson({...project,kind:'roomform-room'},`${slug(project.name)}-room.json`) }
/** The whole studio: every room and every design. */
export function exportStudioJson(studio:Studio) { downloadJson(studio,`${slug(studio.name)}-project.json`) }
function slug(s:string) { return s.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'bedroom' }

/** Renders the same plan drawing used by the editor (without selection or
 *  grid) to an SVG, then rasterises it onto a titled 2400 × 1700 canvas. */
export function export2D(project:Project): Promise<boolean> {
  const layout=activeLayout(project), {width:W,depth:D}=project.room
  const ext=exterior(project)
  const L=Math.min(0,ext?.left??0), T=Math.min(0,ext?.top??0), R=Math.max(W,ext?.right??W), B=Math.max(D,ext?.bottom??D)
  const pad=80, k=Math.max(R-L,B-T)/560
  const ordered=[...layout.furniture.filter(f=>f.kind==='rug'),...layout.furniture.filter(f=>f.kind!=='rug')]
  const markup=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" viewBox={`${L-pad*k} ${T-pad*k} ${R-L+pad*2*k} ${B-T+pad*2*k}`} width={R-L+pad*2*k} height={B-T+pad*2*k} fontFamily="Arial, Helvetica, sans-serif">
    <PlanDefs appearance={layout.appearance} prefix="x" outdoor={project.outdoor}/>
    <RoomShell project={project} appearance={layout.appearance} showGrid={false} showMeasurements k={k} prefix="x"/>
    {ordered.map(f=><FurnitureArt key={f.id} item={f} prefix="x"/>)}
    {ordered.map(f=><FurnitureLabel key={f.id} item={f} k={k}/>)}
  </svg>)
  return new Promise(resolve=>{
    const img=new Image()
    img.onload=()=>{
      const canvas=document.createElement('canvas'); canvas.width=2400; canvas.height=1700
      const c=canvas.getContext('2d'); if(!c){resolve(false);return}
      c.fillStyle='#fbfaf7'; c.fillRect(0,0,canvas.width,canvas.height)
      c.fillStyle='#344b43'; c.font='bold 58px Arial'; c.fillText(project.name,170,116)
      c.fillStyle='#6e7771'; c.font='30px Arial'; c.fillText(layout.name,170,169)
      const box={x:170,y:220,w:2060,h:1280}, s=Math.min(box.w/img.width,box.h/img.height)
      c.drawImage(img,box.x+(box.w-img.width*s)/2,box.y+(box.h-img.height*s)/2,img.width*s,img.height*s)
      c.fillStyle='#7a837d'; c.font='25px Arial'
      c.fillText(`Room ${project.room.width} × ${project.room.depth} cm   ·   Ceiling ${project.room.ceiling} cm   ·   ${layout.furniture.length} items`,170,1580)
      downloadCanvas(canvas,`${slug(project.name)}-${slug(layout.name)}-2d.png`); resolve(true)
    }
    img.onerror=()=>resolve(false)
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup)
  })
}
export function export3D(project:Project) {
  const canvas=document.querySelector<HTMLCanvasElement>('.three-stage canvas')
  if(!canvas) return false
  downloadCanvas(canvas,`${slug(project.name)}-${slug(activeLayout(project).name)}-3d.png`)
  return true
}
