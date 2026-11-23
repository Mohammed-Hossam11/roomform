import { renderToStaticMarkup } from 'react-dom/server'
import { activeLayout, type Project, type Studio } from './model'
import { exterior } from './geometry'
import { FurnitureArt, FurnitureLabel, PlanDefs, RoomShell } from './PlanArt'
import { ALL_INCLUDE, buildDims, DimensionLayer, dimMargin, type MeasureInclude } from './measure'

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

export type PlanExportOptions={dimensions:boolean;include:MeasureInclude;detail:'basic'|'detailed'}
const FULL={w:3200,h:2300}
/** Renders the floor plan (same drawing + same measurement engine as the
 *  editor, independent of the editor's zoom/pan) onto a titled canvas.
 *  `scale` < 1 renders a lighter preview of the identical layout. */
export function renderPlan(project:Project,o:PlanExportOptions,scale=1):Promise<HTMLCanvasElement|null> {
  const layout=activeLayout(project), {width:W,depth:D}=project.room
  const ext=exterior(project)
  const L=Math.min(0,ext?.left??0), T=Math.min(0,ext?.top??0), R=Math.max(W,ext?.right??W), B=Math.max(D,ext?.bottom??D)
  const CW=Math.round(FULL.w*scale), CH=Math.round(FULL.h*scale)
  const box={x:CW*.05,y:CH*.13,w:CW*.9,h:CH*.75}
  // Solve for k (plan units per output pixel) so labels print at ~24 px, including the margin they need.
  let k=Math.max(R-L,B-T)/900
  for(let i=0;i<4;i++){const m=(o.dimensions?dimMargin(o.include,k):26*k)+24*k;const vw=R-L+m*2, vh=B-T+m*2;const s=Math.min(box.w/vw,box.h/vh);k=(24*scale)/(10.5*s)}
  const margin=(o.dimensions?dimMargin(o.include,k):26*k)+24*k
  const vx=L-margin, vy=T-margin, vw=R-L+margin*2, vh=B-T+margin*2
  const dims=o.dimensions?buildDims(project,layout,{mode:'all',include:o.include,detail:o.detail,k}):[]
  const ordered=[...layout.furniture.filter(f=>f.kind==='rug'),...layout.furniture.filter(f=>f.kind!=='rug')]
  const markup=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" viewBox={`${vx} ${vy} ${vw} ${vh}`} width={vw} height={vh} fontFamily="Arial, Helvetica, sans-serif">
    <PlanDefs appearance={layout.appearance} prefix="x" outdoor={project.outdoor}/>
    <rect x={vx} y={vy} width={vw} height={vh} fill="#fbfaf7"/>
    <RoomShell project={project} appearance={layout.appearance} showGrid={false} showMeasurements={false} k={k} prefix="x"/>
    {ordered.map(f=><FurnitureArt key={f.id} item={f} prefix="x"/>)}
    {ordered.map(f=><FurnitureLabel key={f.id} item={f} k={k}/>)}
    <DimensionLayer dims={dims} k={k}/>
  </svg>)
  return new Promise(resolve=>{
    const img=new Image()
    img.onload=()=>{
      const canvas=document.createElement('canvas'); canvas.width=CW; canvas.height=CH
      const c=canvas.getContext('2d'); if(!c){resolve(null);return}
      const px=(v:number)=>Math.round(v*scale)
      c.fillStyle='#fbfaf7'; c.fillRect(0,0,CW,CH)
      c.fillStyle='#24362c'; c.font=`600 ${px(64)}px Arial`; c.fillText(project.name,box.x,px(130))
      c.fillStyle='#7a857e'; c.font=`${px(34)}px Arial`; c.fillText(layout.name,box.x,px(186))
      const s=Math.min(box.w/vw,box.h/vh), dw=vw*s, dh=vh*s
      c.drawImage(img,box.x+(box.w-dw)/2,box.y+(box.h-dh)/2,dw,dh)
      c.fillStyle='#8a948d'; c.font=`${px(26)}px Arial`
      c.fillText(`Room ${W} × ${D} cm  ·  Ceiling ${project.room.ceiling} cm  ·  ${layout.furniture.length} items${o.dimensions?'  ·  All dimensions in centimeters':''}`,box.x,CH-px(70))
      c.textAlign='right'; c.fillText('Roomform',CW-box.x,CH-px(70))
      resolve(canvas)
    }
    img.onerror=()=>resolve(null)
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup)
  })
}
export async function export2D(project:Project,o:PlanExportOptions={dimensions:false,include:ALL_INCLUDE,detail:'basic'}):Promise<boolean> {
  const canvas=await renderPlan(project,o)
  if(!canvas)return false
  const layout=activeLayout(project)
  downloadCanvas(canvas,`${slug(project.name)}-${slug(layout.name)}-${o.dimensions?'dimensioned':'plan'}.png`)
  return true
}
export function export3D(project:Project) {
  const canvas=document.querySelector<HTMLCanvasElement>('.three-stage canvas')
  if(!canvas) return false
  downloadCanvas(canvas,`${slug(project.name)}-${slug(activeLayout(project).name)}-3d.png`)
  return true
}
