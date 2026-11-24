import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CubeCamera, Html, OrbitControls, RoundedBox } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { DoorOpen, RotateCcw } from 'lucide-react'
import { activeLayout, floorPresets, isMirrorKind, WALL_NAMES, type Door, type Furniture, type Project, type WallName } from './model'
import { doorGeometry, exterior, wallFrame, wallInset, wallThickness } from './geometry'
import { deskAccessories, mirrorOutline, type MirrorKind } from './parts'
import { caneCanvas, fabricCanvas, floorCanvas, grainCanvas, GROUND_CM, groundCanvas, TILE_CM, upholsteryCanvas } from './textures'
import { HAVEN, hvOf } from './sofa'

const m=(cm:number)=>cm/100
/** Phones/tablets: lighter shadow maps and mirror reflections, same geometry. */
const COARSE=typeof window!=='undefined'&&window.matchMedia('(pointer: coarse)').matches
function shade(hex:string,delta:number){const n=parseInt(hex.slice(1),16);return '#'+[16,8,0].map(shift=>Math.max(0,Math.min(255,((n>>shift)&255)+delta)).toString(16).padStart(2,'0')).join('')}
function Box({size,position,color,roughness=.83,opacity=1,rotation}:{size:[number,number,number];position:[number,number,number];color:string;roughness?:number;opacity?:number;rotation?:[number,number,number]}) {
  return <mesh position={position} rotation={rotation} castShadow={opacity===1} receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={roughness} transparent={opacity<1} opacity={opacity} depthWrite={opacity===1}/></mesh>
}
function Cyl({r,h,position,color,rotation,roughness=.6,r2}:{r:number;h:number;position:[number,number,number];color:string;rotation?:[number,number,number];roughness?:number;r2?:number}) {
  return <mesh position={position} rotation={rotation} castShadow receiveShadow><cylinderGeometry args={[r,r2??r,h,20]}/><meshStandardMaterial color={color} roughness={roughness}/></mesh>
}
function useFabric() {
  return useMemo(()=>{const t=new THREE.CanvasTexture(fabricCanvas());t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t},[])
}
function Rug({item}:{item:Furniture}) {
  const fabric=useFabric()
  const w=m(item.width),d=m(item.depth)
  const map=useMemo(()=>{const t=fabric.clone();t.repeat.set(item.width/40,item.depth/40);t.needsUpdate=true;return t},[fabric,item.width,item.depth])
  // Sits 2 mm above the floor surface (y=0) so it never z-fights with it.
  return item.rugShape==='circle'
    ? <mesh position={[0,.007,0]} receiveShadow><cylinderGeometry args={[w/2,w/2,.01,72]}/><meshStandardMaterial color={item.color} map={map} roughness={1}/></mesh>
    : <mesh position={[0,.007,0]} receiveShadow><boxGeometry args={[w,.01,d]}/><meshStandardMaterial color={item.color} map={map} roughness={1}/></mesh>
}
function DeskTop({item,h,hasMonitor=false}:{item:Furniture;h:number;hasMonitor?:boolean}) {
  const acc=deskAccessories(item.width,item.depth)
  return <>
    {acc.monitor&&!hasMonitor&&<group position={[m(acc.monitor.x),h,m(acc.monitor.y)]}>
      <Box size={[.16,.012,.1]} position={[0,.006,.02]} color="#4b4f54" roughness={.4}/>
      <Box size={[.03,.16,.02]} position={[0,.09,0]} color="#5a5f64" roughness={.4}/>
      <Box size={[m(acc.monitor.w),m(acc.monitor.w)*.58,.022]} position={[0,.16+m(acc.monitor.w)*.29,0]} color="#24272b" roughness={.35}/>
      <mesh position={[0,.16+m(acc.monitor.w)*.29,.0115]}><planeGeometry args={[m(acc.monitor.w)-.02,m(acc.monitor.w)*.58-.02]}/><meshStandardMaterial color="#3d6d93" emissive="#24496a" emissiveIntensity={.5} roughness={.2}/></mesh>
    </group>}
    {acc.laptop&&<group position={[m(acc.laptop.x),h,m(acc.laptop.y)]}>
      <Box size={[m(acc.laptop.w),.014,m(acc.laptop.d)]} position={[0,.007,0]} color="#c9cdd1" roughness={.35}/>
      <group position={[0,.014,-m(acc.laptop.d)/2]} rotation={[-.35,0,0]}>
        <Box size={[m(acc.laptop.w),m(acc.laptop.d)*.95,.008]} position={[0,m(acc.laptop.d)*.475,0]} color="#c9cdd1" roughness={.35}/>
        <mesh position={[0,m(acc.laptop.d)*.475,.0045]}><planeGeometry args={[m(acc.laptop.w)-.02,m(acc.laptop.d)*.95-.02]}/><meshStandardMaterial color="#2d4f6c" emissive="#1d3a55" emissiveIntensity={.45}/></mesh>
      </group>
    </group>}
    {acc.pad&&<group position={[m(acc.pad.x),h,m(acc.pad.y)]}>
      <Box size={[m(acc.pad.w),.003,m(acc.pad.d)]} position={[0,.0015,0]} color="#3e4a52" roughness={1}/>
      <mesh position={[.02,.012,.01]} scale={[1,.55,1.5]} castShadow><sphereGeometry args={[.022,18,12]}/><meshStandardMaterial color="#eef0f1" roughness={.35}/></mesh>
    </group>}
  </>
}
const sharedTex=new Map<string,THREE.CanvasTexture>()
function useCanvasTex(key:string,make:()=>HTMLCanvasElement,repeat:[number,number]) {
  const base=useMemo(()=>{let t=sharedTex.get(key);if(!t){t=new THREE.CanvasTexture(make());t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;sharedTex.set(key,t)}return t
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key])
  return useMemo(()=>{const t=base.clone();t.repeat.set(repeat[0],repeat[1]);t.needsUpdate=true;return t},[base,repeat[0],repeat[1]])
}
/** Mirror: shaped glass with a real-time captured reflection of the room
 *  (one cube-map render when the scene changes — cheap, not per frame), plus a
 *  frame built from the same outline. Wall / freestanding / leaning mounts. */
function Mirror3D({item,sceneKey}:{item:Furniture;sceneKey:string}) {
  const kind=item.kind as MirrorKind, w=m(item.width), h=m(item.height), d=m(item.depth)
  const frameW=item.frameless?.006:.025
  const {glass,frame,back}=useMemo(()=>{
    const toShape=(pts:[number,number][])=>{const sh=new THREE.Shape();pts.forEach(([x,y],i)=>i?sh.lineTo(x/100,y/100):sh.moveTo(x/100,y/100));sh.closePath();return sh}
    const inner=mirrorOutline(kind,item.width,item.height,item.rounded!==false)
    const outer=mirrorOutline(kind,item.width+frameW*200,item.height+frameW*200,item.rounded!==false)
    const glass=new THREE.ShapeGeometry(toShape(inner),48)
    const fs=toShape(outer); fs.holes.push(new THREE.Path(inner.slice().reverse().map(([x,y])=>new THREE.Vector2(x/100,y/100))))
    const frame=new THREE.ExtrudeGeometry(fs,{depth:item.frameless?.006:.022,bevelEnabled:!item.frameless,bevelSize:.003,bevelThickness:.003,bevelSegments:2,curveSegments:24})
    const back=new THREE.ExtrudeGeometry(toShape(outer),{depth:.012,bevelEnabled:false,curveSegments:24})
    return {glass,frame,back}
  },[kind,item.width,item.height,item.rounded,item.frameless,frameW])
  useEffect(()=>()=>{glass.dispose();frame.dispose();back.dispose()},[glass,frame,back])
  const fc=item.frameless?'#c9d4d7':item.color
  const panel=<group>
    <mesh geometry={back} position={[0,0,-.016]} castShadow><meshStandardMaterial color="#3a3d40" roughness={.8}/></mesh>
    <mesh geometry={frame} position={[0,0,-.006]} castShadow><meshStandardMaterial color={fc} roughness={item.color==='#c9a35b'?.28:.45} metalness={item.color==='#c9a35b'?.85:.15}/></mesh>
    {item.led&&<mesh geometry={back} position={[0,0,-.02]} scale={[1.03,1.03,1]}><meshStandardMaterial color="#fff6e0" emissive="#ffe9b8" emissiveIntensity={1.6} toneMapped={false}/></mesh>}
    <CubeCamera key={sceneKey} resolution={COARSE?128:256} frames={1} near={.05} far={60} position={[0,0,.012]}>
      {(env)=><mesh geometry={glass}><meshStandardMaterial envMap={env} color="#f4f8f9" metalness={1} roughness={.02} envMapIntensity={1.05}/></mesh>}
    </CubeCamera>
  </group>
  if(item.mount==='wall') return <group position={[0,m(item.elevation??0)+h/2,-d/2+.018]}>{panel}</group>
  if(item.mount==='lean'){
    const tilt=Math.atan2(Math.max(.02,d-.05),h)
    return <group position={[0,0,d/2-.03]} rotation={[-tilt,0,0]}><group position={[0,h/2+.01,0]}>{panel}</group></group>
  }
  // freestanding: low plinth with two slim rear supports
  return <>
    <RoundedBox args={[w*.7,.03,d]} radius={.012} smoothness={2} position={[0,.015,0]} castShadow><meshStandardMaterial color={fc} roughness={.5}/></RoundedBox>
    {[-1,1].map(sx=><Box key={sx} size={[.02,h*.6,.02]} position={[sx*w*.25,h*.3+.03,-d*.25]} rotation={[.12,0,0]} color={fc} roughness={.5}/>)}
    <group position={[0,.05+h/2,0]}>{panel}</group>
  </>
}
function TVUnit({item}:{item:Furniture}) {
  const w=m(item.width),d=m(item.depth),h=m(item.height), legH=Math.min(.14,h*.3), body=h-legH
  const grain=useCanvasTex('grain',grainCanvas,[2,1]), cane=useCanvasTex('cane',caneCanvas,[Math.max(1,w*.3/.12),Math.max(1,body/.12)])
  const side=w*.3, wood=<meshStandardMaterial color={item.color} map={grain} roughness={.55}/>
  return <>
    {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sz],i)=><mesh key={i} position={[sx*(w/2-.06),legH/2,sz*(d/2-.05)]} rotation={[sz*.08,0,-sx*.08]} castShadow><cylinderGeometry args={[.018,.011,legH,12]}/>{wood}</mesh>)}
    <mesh position={[0,legH+body/2,-.005]} castShadow receiveShadow><boxGeometry args={[w,body,d-.01]}/>{wood}</mesh>
    <mesh position={[0,h-.01,0]} castShadow><boxGeometry args={[w+.01,.02,d+.005]}/>{wood}</mesh>
    {/* open centre shelving: dark recess + shelf */}
    <mesh position={[0,legH+body/2,d/2-.004]}><planeGeometry args={[w-side*2-.06,body-.05]}/><meshStandardMaterial color={shade(item.color,-70)} roughness={.9}/></mesh>
    <mesh position={[0,legH+body/2,d/2-.08]} castShadow><boxGeometry args={[w-side*2-.06,.018,.16]}/>{wood}</mesh>
    {/* two cane doors with slim wooden frames and small round pulls */}
    {[-1,1].map(sx=>{const cx=sx*(w/2-.025-side/2);return <group key={sx} position={[cx,legH+body/2,d/2-.002]}>
      <mesh position={[0,0,.004]}><planeGeometry args={[side-.04,body-.06]}/><meshStandardMaterial color={item.accent??'#d8bd8c'} map={cane} roughness={.8}/></mesh>
      {[[0,(body-.03)/2,side,.02],[0,-(body-.03)/2,side,.02]].map(([x,y,l,t],i)=><Box key={i} size={[l,t,.016]} position={[x,y,.006]} color={item.color} roughness={.55}/>)}
      {[-1,1].map(e=><Box key={e} size={[.02,body-.02,.016]} position={[e*(side/2-.01),0,.006]} color={item.color} roughness={.55}/>)}
      <mesh position={[-sx*(side/2-.05),0,.02]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.012,.012,.02,16]}/><meshStandardMaterial color={shade(item.color,-30)} roughness={.4}/></mesh>
    </group>})}
  </>
}
function TVWithStand({item}:{item:Furniture}) {
  const w=m(item.width),d=m(item.depth),screenH=m(item.screenHeight??84),standH=m(item.standHeight??27)
  const frame=item.color, faceZ=-d/2+.025, legX=w*.32
  return <>
    {/* One thin screen, dark glass face, and a restrained reflected highlight. */}
    <RoundedBox args={[w,screenH,.035]} radius={.012} smoothness={2} position={[0,standH+screenH/2,faceZ]} castShadow><meshStandardMaterial color={frame} metalness={.35} roughness={.3}/></RoundedBox>
    <Box size={[w-.025,screenH-.025,.004]} position={[0,standH+screenH/2,faceZ+.02]} color="#102438" roughness={.16}/>
    <Box size={[w*.32,screenH*.018,.002]} position={[-w*.26,standH+screenH*.8,faceZ+.023]} color="#476b7d" opacity={.38}/>
    {[-1,1].map(s=><group key={s}>
      <Box size={[.025,standH,.035]} position={[s*legX,standH/2,faceZ+.008]} color={frame} roughness={.35}/>
      <Box size={[.19,.018,d*.75]} position={[s*legX,.009,0]} color={frame} roughness={.38}/>
    </group>)}
  </>
}
function RattanTable({item}:{item:Furniture}) {
  const w=m(item.width),d=m(item.depth),h=m(item.height)
  const grain=useCanvasTex('grain',grainCanvas,[2,1]), cane=useCanvasTex('cane',caneCanvas,[Math.max(1,w/.12),Math.max(1,d/.12)])
  const wood=<meshStandardMaterial color={item.color} map={grain} roughness={.5}/>, r=Math.min(w,d)*.22
  const topShape=useMemo(()=>{const sh=new THREE.Shape(),hw=w/2,hd=d/2,rr=Math.min(r,hw,hd);sh.moveTo(-hw+rr,-hd);sh.lineTo(hw-rr,-hd);sh.quadraticCurveTo(hw,-hd,hw,-hd+rr);sh.lineTo(hw,hd-rr);sh.quadraticCurveTo(hw,hd,hw-rr,hd);sh.lineTo(-hw+rr,hd);sh.quadraticCurveTo(-hw,hd,-hw,hd-rr);sh.lineTo(-hw,-hd+rr);sh.quadraticCurveTo(-hw,-hd,-hw+rr,-hd);return sh},[w,d,r])
  return <>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,h-.028,0]} castShadow receiveShadow><extrudeGeometry args={[topShape,{depth:.028,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:2,curveSegments:16}]}/>{wood}</mesh>
    {/* inset cane panel on the top and a cane lower shelf */}
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,h+.0045,0]} scale={[(w-.1)/w,(d-.1)/d,1]}><shapeGeometry args={[topShape,16]}/><meshStandardMaterial color={item.accent??'#d8bd8c'} map={cane} roughness={.85}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,h*.32,0]} scale={[(w-.12)/w,(d-.12)/d,1]} receiveShadow><shapeGeometry args={[topShape,16]}/><meshStandardMaterial color={item.accent??'#d8bd8c'} map={cane} roughness={.85} side={THREE.DoubleSide}/></mesh>
    {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sz],i)=><mesh key={i} position={[sx*(w/2-.07),(h-.028)/2,sz*(d/2-.06)]} castShadow><cylinderGeometry args={[.02,.015,h-.028,14]}/>{wood}</mesh>)}
    {[-1,1].map(sz=><Box key={sz} size={[w-.14,.025,.025]} position={[0,h*.32,sz*(d/2-.06)]} color={item.color} roughness={.5}/>)}
    {[-1,1].map(sx=><Box key={`x${sx}`} size={[.025,.025,d-.12]} position={[sx*(w/2-.07),h*.32,0]} color={item.color} roughness={.5}/>)}
  </>
}
function LugoChair({item}:{item:Furniture}) {
  const w=m(item.width),d=m(item.depth),h=m(item.height), wood=item.accent??'#d2b089'
  const fab=useCanvasTex(`uph-${item.fabric??'boucle'}`,()=>upholsteryCanvas((item.fabric as 'boucle')??'boucle'),[4,4])
  const seatY=.42*h/.75, aw=Math.max(.03,w*.07)
  // curved armrest: rises from the back, sweeps forward and down into the front leg
  const arm=useMemo(()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,seatY+.08,-d*.32),new THREE.Vector3(0,seatY+.2,-d*.1),new THREE.Vector3(0,seatY+.19,d*.22),new THREE.Vector3(0,seatY+.05,d*.42),new THREE.Vector3(0,.02,d*.44)]),40,aw/2,10,false),[seatY,d,aw])
  useEffect(()=>()=>arm.dispose(),[arm])
  const uph=(c:string)=><meshStandardMaterial color={c} map={fab} roughness={1}/>
  return <>
    {[-1,1].map(sx=><group key={sx} position={[sx*(w/2-aw/2),0,0]}>
      <mesh geometry={arm} castShadow><meshStandardMaterial color={wood} roughness={.5}/></mesh>
      <mesh position={[0,(seatY+.05)/2,-d*.38]} rotation={[-.08,0,0]} castShadow><cylinderGeometry args={[aw*.45,aw*.35,seatY+.08,12]}/><meshStandardMaterial color={wood} roughness={.5}/></mesh>
    </group>)}
    <Box size={[w-aw*2,.04,d*.7]} position={[0,seatY-.12,.0]} color={wood} roughness={.5}/>
    <RoundedBox args={[w-aw*2-.01,.13,d*.68]} radius={.055} smoothness={4} position={[0,seatY-.04,d*.04]} castShadow receiveShadow>{uph(item.color)}</RoundedBox>
    <group position={[0,seatY,-d*.33]} rotation={[-.2,0,0]}>
      <RoundedBox args={[w-aw*2-.01,h-seatY+.06,.14]} radius={.06} smoothness={4} position={[0,(h-seatY)/2,0]} castShadow receiveShadow>{uph(shade(item.color,-4))}</RoundedBox>
    </group>
  </>
}
function HaloTable({item}:{item:Furniture}) {
  const r=m(Math.min(item.width,item.depth))/2,h=m(item.height)
  const grain=useCanvasTex('grain',grainCanvas,[1,1]), wood=<meshStandardMaterial color={item.color} map={grain} roughness={.5}/>
  const legH=h-.03, splay=.16
  return <>
    <mesh position={[0,h-.015,0]} castShadow receiveShadow><cylinderGeometry args={[r,r*.97,.03,48]}/>{wood}</mesh>
    {[0,1,2].map(i=>{const a=i/3*Math.PI*2+Math.PI/6, rr=r*.42
      return <group key={i} position={[Math.cos(a)*rr,legH/2,Math.sin(a)*rr]} rotation={[Math.sin(a)*splay,0,-Math.cos(a)*splay]}>
        <mesh castShadow><cylinderGeometry args={[.026,.016,legH/Math.cos(splay),14]}/>{wood}</mesh></group>})}
  </>
}
const upholsteryTex=new Map<string,THREE.CanvasTexture>()
function useUpholstery(fabric:'flatweave'|'tweed') {
  return useMemo(()=>{let t=upholsteryTex.get(fabric);if(!t){t=new THREE.CanvasTexture(upholsteryCanvas(fabric));t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.repeat.set(6,6);upholsteryTex.set(fabric,t)}return t},[fabric])
}
/** One Cloud Haven section: low plinth, puffy seat cushion, a deep pillowy back
 *  cushion and rounded padded arms, all with soft-edged rounded geometry. */
function HavenModule({item}:{item:Furniture}) {
  const hv=hvOf(item), map=useUpholstery(item.fabric==='tweed'?'tweed':'flatweave')
  const w=m(item.width),d=m(item.depth),h=m(item.height), k=h/m(HAVEN.height)
  const A=Math.min(m(hv.arm),w*.4), B=Math.min(m(hv.back),d*.6)
  const seatH=m(HAVEN.seatH)*k, armH=m(HAVEN.armH)*k, leg=.02, cushion=Math.min(.17,seatH*.38)
  const baseTop=seatH-cushion+.02
  const x0=-w/2+(hv.armL?A:0), x1=w/2-(hv.armR?A:0), iw=Math.max(.05,x1-x0), cx=(x0+x1)/2
  const mat=(c:string,rough=.95)=><meshStandardMaterial color={c} map={map} roughness={rough}/>
  const r=(v:number,lim:number)=>Math.max(.005,Math.min(v,lim/2-.002))
  return <>
    {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sz],i)=><mesh key={i} position={[sx*(w/2-.08),leg/2,sz*(d/2-.08)]}><cylinderGeometry args={[.02,.02,leg,12]}/><meshStandardMaterial color="#3a3632" roughness={.5}/></mesh>)}
    <RoundedBox args={[w-.01,baseTop-leg,d-.01]} radius={r(.05,Math.min(baseTop-leg,w,d))} smoothness={3} position={[0,leg+(baseTop-leg)/2,0]} castShadow receiveShadow>{mat(shade(item.color,-14))}</RoundedBox>
    <RoundedBox args={[iw-.012,cushion,d-B-.012]} radius={r(.075,Math.min(cushion,iw,d-B))} smoothness={4} position={[cx,baseTop+cushion/2-.01,-d/2+B+(d-B)/2]} castShadow receiveShadow>{mat(shade(item.color,4))}</RoundedBox>
    <group position={[cx,baseTop,-d/2+B/2+.015]} rotation={[-.06,0,0]}>
      <RoundedBox args={[iw-.012,h-baseTop+.02,B-.01]} radius={r(.11,Math.min(h-baseTop,iw,B))} smoothness={4} position={[0,(h-baseTop)/2-.01,0]} castShadow receiveShadow>{mat(item.color)}</RoundedBox>
    </group>
    {hv.armL&&<RoundedBox args={[A-.006,armH-leg,d-.006]} radius={r(A*.48,Math.min(A,armH))} smoothness={4} position={[-w/2+A/2,leg+(armH-leg)/2,0]} castShadow receiveShadow>{mat(shade(item.color,-2))}</RoundedBox>}
    {hv.armR&&<RoundedBox args={[A-.006,armH-leg,d-.006]} radius={r(A*.48,Math.min(A,armH))} smoothness={4} position={[w/2-A/2,leg+(armH-leg)/2,0]} castShadow receiveShadow>{mat(shade(item.color,-2))}</RoundedBox>}
  </>
}
function GamingChair({item}:{item:Furniture}) {
  const w=m(item.width),d=m(item.depth),h=m(item.height),c=item.color,a=item.accent??item.color
  const seatY=Math.min(.5,h*.4), r=Math.min(w,d)*.46
  return <>
    {[0,1,2,3,4].map(i=>{const ang=i/5*Math.PI*2;return <group key={i} rotation={[0,ang,0]}>
      <Box size={[.03,.03,r]} position={[0,.07,r/2]} color="#2c2e32" roughness={.4}/>
      <mesh position={[0,.03,r]} rotation={[0,0,Math.PI/2]} castShadow><cylinderGeometry args={[.028,.028,.025,14]}/><meshStandardMaterial color="#1f2124" roughness={.5}/></mesh>
    </group>})}
    <Cyl r={.025} h={seatY-.12} position={[0,(seatY-.12)/2+.08,0]} color="#3a3d42" roughness={.3}/>
    <Box size={[w*.6,.1,d*.58]} position={[0,seatY,d*.06]} color={c} roughness={.7}/>
    <Box size={[w*.12,.03,d*.5]} position={[0,seatY+.055,d*.06]} color={a} roughness={.7}/>
    {[-1,1].map(s=><group key={s}>
      <Box size={[.03,.2,.03]} position={[s*w*.34,seatY+.08,d*.1]} color="#2c2e32" roughness={.4}/>
      <Box size={[.06,.03,d*.32]} position={[s*w*.34,seatY+.19,d*.1]} color="#2c2e32" roughness={.6}/>
    </group>)}
    <group position={[0,seatY,-d*.22]} rotation={[-.12,0,0]}>
      <Box size={[w*.6,h-seatY,.1]} position={[0,(h-seatY)/2,0]} color={c} roughness={.7}/>
      {[-1,1].map(s=><Box key={s} size={[.06,(h-seatY)*.8,.11]} position={[s*w*.27,(h-seatY)*.42,.01]} color={a} roughness={.7}/>)}
      <Box size={[w*.3,.1,.05]} position={[0,(h-seatY)*.86,.07]} color={shade(c,14)} roughness={.8}/>
      <Box size={[w*.32,.12,.04]} position={[0,(h-seatY)*.32,.07]} color={shade(c,10)} roughness={.8}/>
    </group>
  </>
}
function SceneFurniture({item,roomWidth,roomDepth,sceneKey='',supportHeight=0,hasMonitor=false}:{item:Furniture;roomWidth:number;roomDepth:number;sceneKey?:string;supportHeight?:number;hasMonitor?:boolean}) {
  const w=m(item.width),d=m(item.depth),h=m(item.height)
  const x=m(item.x-roomWidth/2),z=m(item.y-roomDepth/2)
  const wood=item.color
  let body:ReactNode
  if(isMirrorKind(item.kind)) body=<Mirror3D item={item} sceneKey={sceneKey}/>
  else switch(item.kind){
    case 'rug': body=<Rug item={item}/>; break
    case 'gaming': body=<GamingChair item={item}/>; break
    case 'haven': body=<HavenModule item={item}/>; break
    case 'tv-unit': body=<TVUnit item={item}/>; break
    case 'tv-stand': body=<TVWithStand item={item}/>; break
    case 'monitor': body=<>
      <Box size={[w*.3,.012,d*.72]} position={[0,.006,d*.08]} color="#4b5358"/>
      <Box size={[.025,h*.27,.025]} position={[0,h*.135,0]} color="#596268"/>
      <Box size={[w,h*.73,.024]} position={[0,h*.63,-d*.28]} color={item.color} roughness={.3}/>
      <Box size={[w-.025,h*.73-.025,.003]} position={[0,h*.63,-d*.28+.014]} color="#284a60" roughness={.15}/>
    </>; break
    case 'vase': body=<>
      <Cyl r={w*.35} r2={w*.45} h={h*.72} position={[0,h*.36,0]} color={item.color}/>
      <Cyl r={w*.22} h={h*.28} position={[0,h*.86,0]} color={item.color}/>
      <Cyl r={w*.2} h={.008} position={[0,h,0]} color="#8d7968"/>
    </>; break
    case 'decor': body=<>
      <Box size={[w*.75,h*.16,d*.72]} position={[0,h*.08,0]} color={item.color}/>
      <mesh position={[0,h*.56,0]} castShadow><sphereGeometry args={[Math.min(w,d,h)*.42,24,16]}/><meshStandardMaterial color={item.color} roughness={.48}/></mesh>
    </>; break
    case 'rattan-table': body=<RattanTable item={item}/>; break
    case 'lugo-chair': body=<LugoChair item={item}/>; break
    case 'halo-table': body=<HaloTable item={item}/>; break
    case 'outdoor-sofa': case 'garden-chair': {
      const cush=item.accent??'#e6e1d6', arm=Math.min(.12,w*.14)
      body=<>
        <Box size={[w,.12,d]} position={[0,.2,0]} color={wood} roughness={.7}/>
        {[-1,1].flatMap(sx=>[-1,1].map(sz=><Box key={`${sx}${sz}`} size={[.05,.14,.05]} position={[sx*(w/2-.04),.07,sz*(d/2-.04)]} color={shade(wood,-20)}/>))}
        {[-1,1].map(sx=><Box key={sx} size={[arm,.38,d]} position={[sx*(w/2-arm/2),.45,0]} color={wood} roughness={.7}/>)}
        <Box size={[w,.42,.08]} position={[0,.55,-d/2+.04]} color={wood} roughness={.7}/>
        <RoundedBox args={[w-arm*2-.01,.12,d-.12]} radius={.04} smoothness={3} position={[0,.32,.04]} castShadow>{<meshStandardMaterial color={cush} roughness={.95}/>}</RoundedBox>
        <RoundedBox args={[w-arm*2-.01,.36,.12]} radius={.05} smoothness={3} position={[0,.56,-d/2+.14]} rotation={[-.12,0,0]} castShadow>{<meshStandardMaterial color={shade(cush,-6)} roughness={.95}/>}</RoundedBox>
      </>
    } break
    case 'outdoor-table': body=<>
      {(()=>{const n=Math.max(4,Math.round(d/.1));return Array.from({length:n},(_,i)=><Box key={i} size={[w,.03,d/n-.008]} position={[0,h-.015,-d/2+(i+.5)*d/n]} color={shade(wood,i%2?-6:4)} roughness={.75}/>)})()}
      {[-1,1].flatMap(sx=>[-1,1].map(sz=><Box key={`${sx}${sz}`} size={[.06,h-.03,.06]} position={[sx*(w/2-.08),(h-.03)/2,sz*(d/2-.08)]} color={shade(wood,-25)}/>))}
    </>; break
    case 'lounger': {
      const frame=item.accent??'#9c7a58'
      body=<>
        <Box size={[w,.06,d]} position={[0,.25,0]} color={frame} roughness={.7}/>
        {[-1,1].flatMap(sx=>[-1,1].map(sz=><Box key={`${sx}${sz}`} size={[.04,.22,.04]} position={[sx*(w/2-.04),.11,sz*(d/2-.06)]} color={shade(frame,-20)}/>))}
        <RoundedBox args={[w-.04,.07,d*.68]} radius={.03} smoothness={3} position={[0,.31,d*.15]} castShadow>{<meshStandardMaterial color={item.color} roughness={.95}/>}</RoundedBox>
        <group position={[0,.28,-d/2+d*.32]} rotation={[.55,0,0]}><RoundedBox args={[w-.04,.07,d*.32]} radius={.03} smoothness={3} position={[0,.03,-d*.16]} castShadow>{<meshStandardMaterial color={item.color} roughness={.95}/>}</RoundedBox></group>
      </>
    } break
    case 'planter': {
      const r=Math.min(w,d)/2, pot=item.accent??'#8c8279', potH=Math.min(.45,h*.4)
      body=<>
        <mesh position={[0,potH/2,0]} castShadow receiveShadow><cylinderGeometry args={[r,r*.78,potH,28]}/><meshStandardMaterial color={pot} roughness={.85}/></mesh>
        <mesh position={[0,potH-.01,0]}><cylinderGeometry args={[r*.92,r*.92,.02,24]}/><meshStandardMaterial color="#4a3b2e" roughness={1}/></mesh>
        {[0,1,2,3,4,5].map(i=>{const a=i/6*Math.PI*2, rr=r*.45, y=potH+(h-potH)*(.35+(i%3)*.18);return <mesh key={i} position={[Math.cos(a)*rr,y,Math.sin(a)*rr]} castShadow><sphereGeometry args={[r*.55,12,10]}/><meshStandardMaterial color={shade(item.color,(i%3)*10-8)} roughness={.9}/></mesh>})}
        <mesh position={[0,potH+(h-potH)*.75,0]} castShadow><sphereGeometry args={[r*.6,14,12]}/><meshStandardMaterial color={shade(item.color,12)} roughness={.9}/></mesh>
      </>
    } break
    case 'bed': body=<>
      <Box size={[w,.16,d]} position={[0,.19,0]} color={wood}/>
      <Box size={[w*.94,.23,d*.9]} position={[0,.38,.02]} color="#f3f1eb"/>
      <Box size={[w*.96,Math.max(.18,h*1.6-.4),.1]} position={[0,.4+Math.max(.18,h*1.6-.4)/2-.1,-d*.45]} color={wood}/>
      <Box size={[w*.84,.035,d*.57]} position={[0,.51,d*.17]} color="#ddd7cb"/>
      <Box size={[w*.35,.09,d*.17]} position={[-w*.24,.55,-d*.29]} color="#fffdf9"/>
      <Box size={[w*.35,.09,d*.17]} position={[w*.24,.55,-d*.29]} color="#fffdf9"/>
      {[[-w*.43,-d*.43],[w*.43,-d*.43],[-w*.43,d*.43],[w*.43,d*.43]].map(([px,pz],i)=><Box key={i} size={[.07,.18,.07]} position={[px,.09,pz]} color="#7a5c46"/>)}
    </>; break
    case 'wardrobe': body=<>
      <Box size={[w,h,d]} position={[0,h/2,0]} color={wood}/>
      <Box size={[.012,h*.92,d*.02]} position={[0,h/2,d/2+.004]} color="#6e5a48"/>
      <Box size={[.025,.16,.025]} position={[-.05,h*.54,d/2+.025]} color="#9c8870"/>
      <Box size={[.025,.16,.025]} position={[.05,h*.54,d/2+.025]} color="#9c8870"/>
    </>; break
    case 'desk': body=<>
      <Box size={[w,.035,d]} position={[0,h-.0175,0]} color={wood}/>
      {[-1,1].flatMap(ix=>[-1,1].map(iz=><Box key={`${ix}:${iz}`} size={[.045,h-.035,.045]} position={[ix*(w/2-.05),(h-.035)/2,iz*(d/2-.05)]} color="#3f3a36" roughness={.5}/>))}
      <Box size={[w-.1,.06,.02]} position={[0,h-.065,-d/2+.06]} color={shade(wood,-20)}/>
      <DeskTop item={item} h={h} hasMonitor={hasMonitor}/>
    </>; break
    case 'shoe': {
      const plinth=.05, rows=h>.9?3:2, rowH=(h-plinth-.02)/rows
      body=<>
        <Box size={[w*.96,plinth,d*.9]} position={[0,plinth/2,-d*.03]} color={shade(wood,-28)}/>
        <Box size={[w,h-plinth,d-.02]} position={[0,plinth+(h-plinth)/2,-.01]} color={wood}/>
        <Box size={[w+.01,.02,d+.005]} position={[0,h-.01,0]} color={shade(wood,8)}/>
        {Array.from({length:rows},(_,i)=>{const y=plinth+rowH*(i+.5);return <group key={i}>
          <Box size={[w-.02,rowH-.012,.012]} position={[0,y,d/2-.008]} color={shade(wood,5)} rotation={[-.03,0,0]}/>
          <Box size={[Math.min(.12,w*.3),.012,.018]} position={[0,y+rowH*.32,d/2+.006]} color="#8a7f72" roughness={.35}/>
        </group>})}
      </>
    } break
    case 'chair': body=<>
      <Box size={[w,.06,d]} position={[0,.46,0]} color={wood}/>
      <Box size={[w,.4,.05]} position={[0,.7,-d/2+.03]} color={wood}/>
      {[-1,1].flatMap(ix=>[-1,1].map(iz=><Box key={`${ix}:${iz}`} size={[.035,.44,.035]} position={[ix*(w/2-.05),.22,iz*(d/2-.05)]} color="#665649"/>))}
    </>; break
    case 'sofa': body=<>
      <Box size={[w,.35,d]} position={[0,.28,0]} color={wood}/>
      <Box size={[w,.46,.18]} position={[0,.57,-d/2+.09]} color={wood}/>
      <Box size={[.16,.3,d]} position={[-w/2+.08,.5,0]} color={wood}/>
      <Box size={[.16,.3,d]} position={[w/2-.08,.5,0]} color={wood}/>
      <Box size={[w-.34,.1,d-.22]} position={[0,.5,.06]} color={shade(wood,12)}/>
    </>; break
    default: body=<>
      <Box size={[w,h,d]} position={[0,h/2,0]} color={wood}/>
      {(item.kind==='dresser'||item.kind==='bedside'||item.kind==='shelf') && [0.3,0.53,0.76].map(q=><Box key={q} size={[w*.75,.016,.015]} position={[0,h*q,d/2+.01]} color="#7c6552"/>)}
    </>
  }
  return <group position={[x,m(supportHeight),z]} rotation={[0,-item.rotation*Math.PI/180,0]}>{body}</group>
}
export type CameraView='overview'|'inside'|'top'|'exterior'
type Orbit={target:THREE.Vector3;update:()=>void;minDistance:number;maxDistance:number;maxPolarAngle:number;minPolarAngle:number;addEventListener:(t:'change',f:()=>void)=>void;removeEventListener:(t:'change',f:()=>void)=>void}
const FOV:Record<CameraView,number>={overview:42,inside:68,top:40,exterior:50}
const EYE=1.6, LOOK=.05
/** Smallest distance along `dir` from `target` at which every point group
 *  projects inside its viewport margin (0.9 ≈ fills 90 % of the viewer). */
function fitDistance(base:THREE.PerspectiveCamera,aspect:number,fov:number,up:THREE.Vector3,dir:THREE.Vector3,target:THREE.Vector3,groups:{pts:THREE.Vector3[];margin:number}[]) {
  const cam=base.clone(); cam.fov=fov; cam.aspect=aspect; cam.up.copy(up); cam.updateProjectionMatrix()
  const fits=(dist:number)=>{
    cam.position.copy(target).addScaledVector(dir,dist); cam.lookAt(target); cam.updateMatrixWorld(true)
    return groups.every(g=>g.pts.every(c=>{const v=c.clone().project(cam);return v.z<1&&Math.abs(v.x)<=g.margin&&Math.abs(v.y)<=g.margin}))
  }
  let lo=.5,hi=120
  for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(fits(mid))hi=mid;else lo=mid}
  return hi
}
/** Frames the room for each camera preset, keeps the user's angle when the
 *  room is resized, and keeps the camera out of the floor and walls. */
function CameraRig({view,w,d,h,resetKey,front='bottom',roomId=''}:{view:CameraView;w:number;d:number;h:number;resetKey:number;front?:WallName;roomId?:string}) {
  const {camera,controls,size,gl}=useThree()
  const last=useRef<{view:CameraView;resetKey:number;fit:number;roomId:string}|null>(null)
  const inset=.25 // closest the eye may get to a wall (m)
  const clampEye=(p:THREE.Vector3)=>{p.x=Math.max(-w/2+inset,Math.min(w/2-inset,p.x)); p.z=Math.max(-d/2+inset,Math.min(d/2-inset,p.z)); p.y=EYE}
  useEffect(()=>{
    const orbit=controls as unknown as Orbit|null
    if(!orbit||!size.width||!size.height)return
    const cam=camera as THREE.PerspectiveCamera, aspect=size.width/size.height
    const prev=last.current
    const fresh=!prev||prev.view!==view||prev.resetKey!==resetKey||prev.roomId!==roomId
    let fit=0
    if(view==='inside'){
      // Look-around camera: the orbit target sits 5 cm in front of the eye, so dragging turns the head.
      cam.fov=FOV.inside; cam.up.set(0,1,0); cam.near=.02
      orbit.minDistance=LOOK; orbit.maxDistance=LOOK; orbit.minPolarAngle=Math.PI*.3; orbit.maxPolarAngle=Math.PI*.74
      const look=fresh?new THREE.Vector3(-w*.2,1.25,-d*.2):orbit.target.clone()
      if(fresh) cam.position.set(w/2-Math.min(.6,w*.15),EYE,d/2-Math.min(.6,d*.15)) // standing near the front-right corner
      clampEye(cam.position)
      const fwd=look.sub(cam.position).normalize()
      orbit.target.copy(cam.position).addScaledVector(fwd,LOOK)
    } else {
      const top=view==='top'
      const full:THREE.Vector3[]=[], low:THREE.Vector3[]=[]
      for(const x of [-w/2,w/2])for(const z of [-d/2,d/2]){full.push(new THREE.Vector3(x,0,z),new THREE.Vector3(x,h,z));low.push(new THREE.Vector3(x,0,z),new THREE.Vector3(x,Math.min(h,1.1),z))}
      const up=top?new THREE.Vector3(0,0,-1):new THREE.Vector3(0,1,0)
      const ext=view==='exterior'
      const nrm={top:[0,-1],bottom:[0,1],left:[-1,0],right:[1,0]}[front] as [number,number]
      const target=ext?new THREE.Vector3(nrm[0]*w*.15,h*.4,nrm[1]*d*.15):new THREE.Vector3(0,top?0:h*.22,0)
      // A lower, more natural angle than a high "model" view; the furnished floor fills ~90 %,
      // while the full wall height must still stay inside the viewer.
      const el=27*Math.PI/180, az=36*Math.PI/180
      // Exterior: stand outside, facing the glass (or front) wall, slightly above eye level.
      const presetDir=ext?new THREE.Vector3(nrm[0]*Math.cos(.16)+(nrm[1]?.25:0),Math.sin(.16),nrm[1]*Math.cos(.16)+(nrm[0]?.25:0)).normalize():top?new THREE.Vector3(0,1,0):new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el))
      const userDir=cam.position.clone().sub(orbit.target)
      const dir=fresh||userDir.lengthSq()<1e-6||prev?.view==='inside'?presetDir:userDir.normalize()
      fit=fitDistance(cam,aspect,FOV[view],up,dir,target,top?[{pts:full,margin:.9}]:ext?[{pts:full,margin:.9}]:[{pts:low,margin:.92},{pts:full,margin:.99}])
      cam.fov=FOV[view]; cam.up.copy(up); cam.near=.05
      orbit.minDistance=Math.max(1,fit*.3); orbit.maxDistance=fit*2.2; orbit.minPolarAngle=0; orbit.maxPolarAngle=Math.PI*.47
      if(fresh) cam.position.copy(target).addScaledVector(dir,fit)
      else {
        // Room resized or viewport changed: keep the user's angle and relative zoom, re-centre on the room.
        const dist=cam.position.distanceTo(orbit.target), prevFit=prev.fit||fit
        cam.position.copy(target).addScaledVector(dir,Math.max(orbit.minDistance,Math.min(orbit.maxDistance,dist*fit/prevFit)))
      }
      orbit.target.copy(target)
    }
    cam.aspect=aspect; cam.updateProjectionMatrix(); cam.lookAt(orbit.target); orbit.update()
    last.current={view,resetKey,fit,roomId}
  },[camera,controls,view,resetKey,w,d,h,size.width,size.height,roomId,front])
  // Keep the camera above the floor; in the eye-level view keep it inside the walls at 160 cm.
  useEffect(()=>{
    const orbit=controls as unknown as Orbit|null
    if(!orbit)return
    const clamp=()=>{
      const p=camera.position
      if(view==='inside'){
        const off=orbit.target.clone().sub(p)
        clampEye(p); orbit.target.copy(p).add(off)
      } else if(p.y<.25) p.y=.25
    }
    orbit.addEventListener('change',clamp)
    // Scroll walks forward/back in the eye-level view instead of zooming.
    const wheel=(e:WheelEvent)=>{
      if(view!=='inside')return
      e.preventDefault()
      const fwd=orbit.target.clone().sub(camera.position); fwd.y=0
      if(fwd.lengthSq()<1e-8)return
      fwd.normalize().multiplyScalar(-Math.sign(e.deltaY)*Math.min(.35,Math.abs(e.deltaY)*.0025))
      camera.position.add(fwd); orbit.target.add(fwd); clamp(); orbit.update()
    }
    // Arrow keys / WASD step around the room in the eye-level view.
    const key=(e:KeyboardEvent)=>{
      if(view!=='inside'||(e.target as HTMLElement)?.closest?.('input,textarea,select'))return
      const k=e.key.toLowerCase(), f=orbit.target.clone().sub(camera.position); f.y=0
      if(f.lengthSq()<1e-8)return
      f.normalize(); const r=new THREE.Vector3(-f.z,0,f.x), step=.15, mv=new THREE.Vector3()
      if(k==='w'||k==='arrowup')mv.addScaledVector(f,step); else if(k==='s'||k==='arrowdown')mv.addScaledVector(f,-step)
      else if(k==='a'||k==='arrowleft')mv.addScaledVector(r,-step); else if(k==='d'||k==='arrowright')mv.addScaledVector(r,step); else return
      e.preventDefault(); camera.position.add(mv); orbit.target.add(mv); clamp(); orbit.update()
    }
    // On-screen walk buttons (touch devices) dispatch 'roomform:walk' with {forward, side} in metres.
    const walk=(e:Event)=>{
      if(view!=='inside')return
      const {forward=0,side=0}=(e as CustomEvent<{forward?:number;side?:number}>).detail??{}
      const f=orbit.target.clone().sub(camera.position); f.y=0; if(f.lengthSq()<1e-8)return
      f.normalize(); const r=new THREE.Vector3(-f.z,0,f.x), mv=new THREE.Vector3().addScaledVector(f,forward).addScaledVector(r,side)
      camera.position.add(mv); orbit.target.add(mv); clamp(); orbit.update()
    }
    const el=gl.domElement
    el.addEventListener('wheel',wheel,{passive:false}); window.addEventListener('keydown',key); window.addEventListener('roomform:walk',walk)
    return()=>{orbit.removeEventListener('change',clamp);el.removeEventListener('wheel',wheel);window.removeEventListener('keydown',key);window.removeEventListener('roomform:walk',walk)}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[camera,controls,gl,view,w,d,h])
  return null
}
type Hole={start:number;width:number;bottom:number;top:number}
const FRAME_HEX={none:'#cfdde2',black:'#26282b',white:'#f2f2ef',aluminum:'#a7abb0'}
/** Wall pieces around openings (metres). `kind` picks plaster or glazing. */
function wallPieces(L:number,H:number,holes:Hole[]){
  const cuts=[...new Set([0,L,...holes.flatMap(h=>[h.start,h.start+h.width])])].sort((a,b)=>a-b)
  const pieces:{a:number;b:number;y0:number;y1:number}[]=[]
  for(let i=0;i<cuts.length-1;i++){
    const a=cuts[i],b=cuts[i+1]; if(b-a<1e-4)continue
    const hole=holes.find(h=>h.start<=a+1e-6&&h.start+h.width>=b-1e-6)
    if(!hole)pieces.push({a,b,y0:0,y1:H})
    else{ if(hole.bottom>0)pieces.push({a,b,y0:0,y1:hole.bottom}); if(hole.top<H)pieces.push({a,b,y0:hole.top,y1:H}) }
  }
  return pieces
}
function Wall({wall,project,color,opacity,holes}:{wall:WallName;project:Project;color:string;opacity:number;holes:Hole[]}) {
  const spec=project.walls[wall]
  if(spec.type==='open')return null
  const f=wallFrame(wall,project), L=m(f.length), H=m(project.room.ceiling), T=m(wallThickness(project,wall))
  const W=m(project.room.width), D=m(project.room.depth)
  const [ja,jb]=f.ax?(['left','right'] as WallName[]):(['top','bottom'] as WallName[])
  const extA=m(wallInset(project,ja)), extB=m(wallInset(project,jb))
  const pieces=wallPieces(L,H,holes)
  const place=(a0:number,b0:number,y0:number,y1:number,depth:number,inset=0)=>{
    const a=a0===0?a0-extA:a0, b=b0===L?b0+extB:b0, mid=(a+b)/2, len=b-a, hh=y1-y0
    return {pos:[m(f.ox)-W/2+f.ax*mid+f.nx*inset, y0+hh/2, m(f.oy)-D/2+f.ay*mid+f.ny*inset] as [number,number,number], size:(f.ax?[len,hh,depth]:[depth,hh,len]) as [number,number,number], len}
  }
  if(spec.type==='glass'){
    const fc=FRAME_HEX[spec.frame], frameT=spec.frame==='none'?0:.045
    return <>{pieces.map((p,i)=>{
      const g=place(p.a,p.b,p.y0,p.y1,.014)
      const mullions=spec.frame==='none'?[]:Array.from({length:Math.max(0,Math.floor(g.len/1.2))},(_,k)=>p.a+(k+1)*(p.b-p.a)/(Math.floor(g.len/1.2)+1))
      return <group key={i}>
        <mesh position={g.pos} renderOrder={2}><boxGeometry args={g.size}/>
          <meshPhysicalMaterial color="#d9edf2" transparent opacity={.17} roughness={.03} metalness={.1} clearcoat={1} clearcoatRoughness={.05} reflectivity={.6} depthWrite={false}/></mesh>
        {/* glass edges and frame rails */}
        {frameT>0?<>
          <Box {...(()=>{const r=place(p.a,p.b,p.y0,p.y0+frameT,T);return {size:r.size,position:r.pos}})()} color={fc} roughness={.35}/>
          <Box {...(()=>{const r=place(p.a,p.b,p.y1-frameT,p.y1,T);return {size:r.size,position:r.pos}})()} color={fc} roughness={.35}/>
          {mullions.map(mx=>{const r=place(mx-.02,mx+.02,p.y0,p.y1,T);return <Box key={mx} size={r.size} position={r.pos} color={fc} roughness={.35}/>})}
          {[p.a,p.b].map(e=>{const r=place(Math.max(0,e-.02),Math.min(L,e+.02),p.y0,p.y1,T);return <Box key={`e${e}`} size={r.size} position={r.pos} color={fc} roughness={.35}/>})}
        </>:<>
          <mesh position={place(p.a,p.b,p.y1-.004,p.y1,.016).pos}><boxGeometry args={place(p.a,p.b,p.y1-.004,p.y1,.016).size}/><meshStandardMaterial color="#b9d3da" transparent opacity={.7}/></mesh>
          <mesh position={place(p.a,p.b,p.y0,p.y0+.02,.03).pos}><boxGeometry args={place(p.a,p.b,p.y0,p.y0+.02,.03).size}/><meshStandardMaterial color="#9aa1a5" metalness={.6} roughness={.3}/></mesh>
        </>}
      </group>
    })}</>
  }
  return <>{pieces.map((p,i)=>{const g=place(p.a,p.b,p.y0,p.y1,T);return <Box key={i} size={g.size} position={g.pos} color={color} opacity={opacity}/>})}</>
}
const DOOR_ANIM_S=.65
const ease=(t:number)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2
const glassMat=<meshPhysicalMaterial color="#d6ecf2" transparent opacity={.22} roughness={.04} metalness={.1} clearcoat={1} depthWrite={false}/>
/** Hinged door (solid or framed glass) with frame, casings, slab and lever
 *  handles. The slab pivots on a hinge at the room-side (or outside, for
 *  outward doors) face of the wall, so it fills the opening when closed and
 *  never cuts into the jamb when open. Animation runs per frame on a ref. */
function DoorAssembly({project,door,open,onToggle}:{project:Project;door:Door;open:boolean;onToggle:()=>void}) {
  const f=wallFrame(door.wall,project), W=project.room.width, D=project.room.depth
  const g=doorGeometry(project,door)
  const T=wallThickness(project,door.wall)
  const toward=Math.sign(g.freeAlong-g.hingeAlong)||1
  const FR=2.5, SLAB_T=4 // frame and slab thickness, cm
  const toWorld=(along:number,inward:number)=>({x:m(f.ox+f.ax*along+f.nx*inward-W/2),z:m(f.oy+f.ay*along+f.ny*inward-D/2)})
  const pivotAlong=g.hingeAlong+toward*FR, pivotInward=g.sign*Math.max(0,T/2-SLAB_T/2-.5)
  const pivot=toWorld(pivotAlong,pivotInward)
  const angleOf=(vx:number,vy:number)=>Math.atan2(-vy,vx)
  const closedA=angleOf(f.ax*toward,f.ay*toward), openRaw=angleOf(f.nx*g.sign,f.ny*g.sign)
  let delta=openRaw-closedA; while(delta>Math.PI)delta-=2*Math.PI; while(delta<-Math.PI)delta+=2*Math.PI
  const DH=door.height
  const slabLen=m(door.width-2*FR-.6), slabH=m(DH-FR-1), color=door.color??'#ece6dc', glass=door.kind==='glass'
  const leaf=useRef<THREE.Group>(null), progress=useRef(open?1:0)
  const [hover,setHover]=useState(false)
  useEffect(()=>{if(leaf.current)leaf.current.rotation.y=closedA+delta*ease(progress.current)},[closedA,delta])
  useFrame((_,dt)=>{
    const goal=open?1:0, p=progress.current
    if(p===goal||!leaf.current)return
    const next=goal>p?Math.min(goal,p+dt/DOOR_ANIM_S):Math.max(goal,p-dt/DOOR_ANIM_S) // reversible mid-swing
    progress.current=next; leaf.current.rotation.y=closedA+delta*ease(next)
  })
  useEffect(()=>()=>{document.body.style.cursor=''},[])
  const rotY=f.ax?0:Math.PI/2
  const frameC=glass?'#2b2d30':'#f4f1ea'
  const part=(along:number,inward:number,y:number,len:number,depth:number,h:number,key:string,c=frameC)=>{const p=toWorld(along,inward);return <Box key={key} size={[m(len),m(h),m(depth)]} position={[p.x,m(y),p.z]} rotation={[0,rotY,0]} color={c} roughness={.55}/>}
  const s0=door.start, s1=door.start+door.width, CAS=6, solidWall=project.walls[door.wall].type==='solid'
  const click=(e:ThreeEvent<MouseEvent>)=>{e.stopPropagation(); if(e.delta>6)return; onToggle()}
  const handleX=slabLen-m(7)
  const hoverProps={onClick:click,onPointerOver:(e:ThreeEvent<PointerEvent>)=>{e.stopPropagation();setHover(true);document.body.style.cursor='pointer'},onPointerOut:()=>{setHover(false);document.body.style.cursor=''}}
  return <group>
    {part(s0+FR/2,0,DH/2,FR,T+1,DH,'j0')}
    {part(s1-FR/2,0,DH/2,FR,T+1,DH,'j1')}
    {part((s0+s1)/2,0,DH-FR/2,door.width,T+1,FR,'hd')}
    {solidWall&&!glass&&[-1,1].flatMap(side=>[
      part(s0-CAS/2,side*(T/2+.6),(DH+CAS)/2,CAS,1.2,DH+CAS,`c0${side}`),
      part(s1+CAS/2,side*(T/2+.6),(DH+CAS)/2,CAS,1.2,DH+CAS,`c1${side}`),
      part((s0+s1)/2,side*(T/2+.6),DH+CAS/2,door.width+CAS*2,1.2,CAS,`ch${side}`),
    ])}
    <group ref={leaf} position={[pivot.x,0,pivot.z]} rotation={[0,closedA+delta*ease(progress.current),0]}>
      {glass?<>
        <mesh position={[slabLen/2,m(.5)+slabH/2,0]} {...hoverProps}><boxGeometry args={[slabLen-.08,slabH-.08,.012]}/>{glassMat}</mesh>
        {[[slabLen/2,m(.5)+.02,slabLen,.04],[slabLen/2,m(.5)+slabH-.02,slabLen,.04]].map(([x,y,l,hh],i)=><mesh key={i} position={[x,y,0]} castShadow {...hoverProps}><boxGeometry args={[l,hh,m(SLAB_T)]}/><meshStandardMaterial color={color} roughness={.35} emissive="#ffffff" emissiveIntensity={hover?.08:0}/></mesh>)}
        {[.02,slabLen-.02].map((x,i)=><mesh key={`v${i}`} position={[x,m(.5)+slabH/2,0]} castShadow {...hoverProps}><boxGeometry args={[.04,slabH,m(SLAB_T)]}/><meshStandardMaterial color={color} roughness={.35} emissive="#ffffff" emissiveIntensity={hover?.08:0}/></mesh>)}
      </>:<>
        <mesh position={[slabLen/2,m(.5)+slabH/2,0]} castShadow receiveShadow {...hoverProps}>
          <boxGeometry args={[slabLen,slabH,m(SLAB_T)]}/>
          <meshStandardMaterial color={color} roughness={.5} emissive="#ffffff" emissiveIntensity={hover?.07:0}/>
        </mesh>
        {[-1,1].map(side=><mesh key={side} position={[slabLen/2,m(.5)+slabH*.5,side*m(SLAB_T/2+.05)]} rotation={[0,side<0?Math.PI:0,0]}><planeGeometry args={[slabLen*.78,slabH*.84]}/><meshStandardMaterial color={shade(color,-8)} roughness={.6} transparent opacity={.35}/></mesh>)}
      </>}
      {[-1,1].map(side=><group key={side} position={[handleX,1.0,side*m(SLAB_T/2)]}>
        <mesh rotation={[Math.PI/2,0,0]} position={[0,0,side*.006]} castShadow><cylinderGeometry args={[.026,.026,.012,24]}/><meshStandardMaterial color="#8c8a86" metalness={.7} roughness={.3}/></mesh>
        <mesh position={[-.055,0,side*.03]} castShadow><boxGeometry args={[.12,.016,.016]}/><meshStandardMaterial color="#8c8a86" metalness={.7} roughness={.3}/></mesh>
        <mesh rotation={[Math.PI/2,0,0]} position={[0,0,side*.018]}><cylinderGeometry args={[.008,.008,.024,12]}/><meshStandardMaterial color="#8c8a86" metalness={.7} roughness={.3}/></mesh>
      </group>)}
      {[.25,1.05,Math.max(1.3,slabH-.25)].map(y=><Box key={y} size={[.012,.09,m(SLAB_T)+.004]} position={[.004,y,0]} color="#9a968f" roughness={.35}/>)}
      {hover&&<Html position={[handleX,1.22,0]} center zIndexRange={[20,0]}><div className="door-hint">{open?'Click to close':'Click to open'}</div></Html>}
    </group>
  </group>
}
/** Two-panel sliding glass door: the outer panel is fixed, the inner panel
 *  slides along its own track over the fixed one. */
function SlidingDoor({project,door,open,onToggle}:{project:Project;door:Door;open:boolean;onToggle:()=>void}) {
  const f=wallFrame(door.wall,project), W=project.room.width, D=project.room.depth
  const T=Math.max(4,wallThickness(project,door.wall))
  const toWorld=(along:number,inward:number)=>({x:m(f.ox+f.ax*along+f.nx*inward-W/2),z:m(f.oy+f.ay*along+f.ny*inward-D/2)})
  const rotY=f.ax?0:Math.PI/2, color=door.color??'#2b2d30'
  const FR=4, panelW=door.width/2+3, H=door.height
  const slide=useRef<THREE.Group>(null), progress=useRef(open?1:0)
  const [hover,setHover]=useState(false)
  const toStart=door.hinge==='start' // which way the panel slides when opening
  const closedStart=toStart?door.start+door.width-FR-panelW:door.start+FR, openStart=toStart?door.start+FR:door.start+door.width-FR-panelW
  const setPos=(t:number)=>{if(!slide.current)return;const p=toWorld(closedStart+(openStart-closedStart)*ease(t)+panelW/2,T*.22);slide.current.position.set(p.x,0,p.z)}
  useEffect(()=>setPos(progress.current))
  useFrame((_,dt)=>{const goal=open?1:0,p=progress.current;if(p===goal)return;const n=goal>p?Math.min(goal,p+dt/.8):Math.max(goal,p-dt/.8);progress.current=n;setPos(n)})
  useEffect(()=>()=>{document.body.style.cursor=''},[])
  const click=(e:ThreeEvent<MouseEvent>)=>{e.stopPropagation(); if(e.delta>6)return; onToggle()}
  const hp={onClick:click,onPointerOver:(e:ThreeEvent<PointerEvent>)=>{e.stopPropagation();setHover(true);document.body.style.cursor='pointer'},onPointerOut:()=>{setHover(false);document.body.style.cursor=''}}
  const panel=(key:string)=><group key={key}>
    <mesh position={[0,m(H/2),0]} {...hp}><boxGeometry args={[m(panelW)-.06,m(H)-.08,.012]}/>{glassMat}</mesh>
    {[[0,.025,m(panelW),.05],[0,m(H)-.025,m(panelW),.05]].map(([x,y,l,hh],i)=><mesh key={i} position={[x,y,0]} castShadow {...hp}><boxGeometry args={[l,hh,.04]}/><meshStandardMaterial color={color} roughness={.35} metalness={.3} emissive="#ffffff" emissiveIntensity={hover?.08:0}/></mesh>)}
    {[-1,1].map(sd=><mesh key={sd} position={[sd*(m(panelW)/2-.025),m(H/2),0]} castShadow {...hp}><boxGeometry args={[.05,m(H),.04]}/><meshStandardMaterial color={color} roughness={.35} metalness={.3} emissive="#ffffff" emissiveIntensity={hover?.08:0}/></mesh>)}
  </group>
  const fixed=toWorld((toStart?door.start+FR:door.start+door.width-FR-panelW)+panelW/2,-T*.22)
  const fr=(along:number,len:number,y:number,hh:number,key:string)=>{const p=toWorld(along,0);return <Box key={key} size={[m(len),m(hh),m(T+1)]} position={[p.x,m(y),p.z]} rotation={[0,rotY,0]} color={color} roughness={.35}/>}
  return <group>
    {fr(door.start+FR/2,FR,H/2,H,'l')}{fr(door.start+door.width-FR/2,FR,H/2,H,'r')}{fr(door.start+door.width/2,door.width,H-FR/2,FR,'t')}{fr(door.start+door.width/2,door.width,.6,1.2,'b')}
    <group position={[fixed.x,0,fixed.z]} rotation={[0,rotY,0]}>{panel('fixed')}</group>
    <group ref={slide} rotation={[0,rotY,0]}>{panel('slide')}{hover&&<Html position={[0,1.3,0]} center zIndexRange={[20,0]}><div className="door-hint">{open?'Click to close':'Click to open'}</div></Html>}</group>
  </group>
}
function OutdoorGround({project}:{project:Project}) {
  const ext=exterior(project), o=project.outdoor
  const tex=useMemo(()=>{
    if(!ext||o.ground==='none')return null
    const t=new THREE.CanvasTexture(groundCanvas(o.ground,o.color)); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8
    t.repeat.set((ext.right-ext.left)/GROUND_CM,(ext.bottom-ext.top)/GROUND_CM); return t
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[o.ground,o.color,ext?.left,ext?.right,ext?.top,ext?.bottom])
  useEffect(()=>()=>tex?.dispose(),[tex])
  if(!ext||!tex)return null
  const W=project.room.width,D=project.room.depth
  const cx=m((ext.left+ext.right)/2-W/2), cz=m((ext.top+ext.bottom)/2-D/2)
  // Sits 3 cm below the interior floor so it never intersects the room's flooring.
  return <mesh rotation={[-Math.PI/2,0,0]} position={[cx,-.03,cz]} receiveShadow><planeGeometry args={[m(ext.right-ext.left),m(ext.bottom-ext.top)]}/><meshStandardMaterial map={tex} roughness={1}/></mesh>
}
export default function Room3D({project,furniture,mode,resetKey=0,onReset,openDoors={},onToggleDoor,onToggleAll}:{project:Project;furniture:Furniture[];mode:CameraView;resetKey?:number;onReset?:()=>void;openDoors?:Record<string,boolean>;onToggleDoor?:(id:string)=>void;onToggleAll?:()=>void}) {
  const W=project.room.width, D=project.room.depth
  const w=m(W),d=m(D)
  const {doors,windows,ac}=project
  const appearance=activeLayout(project).appearance, floor=appearance.floor
  const floorTex=useMemo(()=>{
    const t=new THREE.CanvasTexture(floorCanvas(floor.material,floor.baseColor))
    t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8
    const vertical=floorPresets[floor.material].kind==='wood'&&floor.direction==='vertical'
    t.repeat.set(W/TILE_CM,D/TILE_CM)
    if(vertical){t.rotation=Math.PI/2;t.repeat.set(D/TILE_CM,W/TILE_CM)}
    return t
  },[floor.material,floor.baseColor,floor.direction,W,D])
  useEffect(()=>()=>floorTex.dispose(),[floorTex])
  const holes=(wall:WallName):Hole[]=>[
    ...doors.filter(dr=>dr.wall===wall).map(dr=>({start:m(dr.start),width:m(dr.width),bottom:0,top:m(dr.height)})),
    ...windows.filter(wi=>wi.wall===wall).map(wi=>({start:m(wi.start),width:m(wi.width),bottom:m(wi.sill),top:m(wi.sill+wi.height)})),
  ]
  const front=frontWall(project)
  // Walls nearest the outside cameras are see-through so the room stays visible;
  // standing inside, every wall is solid. From outside, the wall you face is see-through.
  const opacityFor=(wall:WallName)=>mode==='inside'?1:mode==='exterior'?(wall===front?.18:1):(wall==='right'||wall==='bottom')?.18:1
  const h=m(project.room.ceiling)
  const at=(wall:WallName,along:number,inward:number)=>{const f=wallFrame(wall,project);return {x:m(f.ox+f.ax*along+f.nx*inward)-w/2,z:m(f.oy+f.ay*along+f.ny*inward)-d/2,rotY:f.ax?0:Math.PI/2}}
  const outdoorOn=!!exterior(project)
  const anyOpen=doors.some(dr=>openDoors[dr.id])
  // Mirrors re-capture their reflection when the room's contents or finishes change.
  const sceneKey=useMemo(()=>[furniture.map(f=>`${f.id}:${Math.round(f.x)}:${Math.round(f.y)}:${Math.round(f.rotation)}:${f.color}:${Math.round(f.width)}:${Math.round(f.height)}:${f.supportId??''}`).join(','),floor.material,floor.baseColor,JSON.stringify(appearance.walls),mode,JSON.stringify(project.walls),W,D].join('|'),[furniture,floor.material,floor.baseColor,appearance.walls,mode,project.walls,W,D])
  return <div className="three-stage">
    <Canvas shadows="soft" dpr={COARSE?[1,1.25]:[1,2]} gl={{preserveDrawingBuffer:true,antialias:!COARSE}} camera={{position:[5.6,4.1,5.8],fov:42,near:.05,far:300}}
      onCreated={({gl})=>{gl.toneMapping=THREE.NeutralToneMapping;gl.toneMappingExposure=1}}>
      <color attach="background" args={[outdoorOn?'#dde7ea':'#e9eae6']}/>
      {outdoorOn&&<fog attach="fog" args={['#dde7ea',Math.max(w,d)*3,Math.max(w,d)*7]}/>}
      <ambientLight intensity={outdoorOn?.55:.5}/><hemisphereLight args={[outdoorOn?'#eef6ff':'#fffdf8',outdoorOn?'#8f9a7a':'#a8a191',outdoorOn?1:.85]}/>
      {mode==='inside'&&<mesh rotation={[Math.PI/2,0,0]} position={[0,h,0]}><planeGeometry args={[w+.1,d+.1]}/><meshStandardMaterial color="#f5f3ef" roughness={.95}/></mesh>}
      <directionalLight position={[-w*.6,Math.max(w,d)*1.2+3,d*.8]} intensity={outdoorOn?2.6:2.3} color="#fff6ea" castShadow shadow-mapSize={COARSE?[1024,1024]:[2048,2048]} shadow-bias={-.0004} shadow-normalBias={.02} shadow-camera-near={.5} shadow-camera-far={Math.max(w,d)*4+12} shadow-camera-left={-Math.max(4,w*.75)} shadow-camera-right={Math.max(4,w*.75)} shadow-camera-top={Math.max(4,d*.75)} shadow-camera-bottom={-Math.max(4,d*.75)}/>
      <directionalLight position={[w*.8,2.4,d*1.2]} intensity={.4} color="#eef3ff"/>
      <pointLight position={[0,h-.25,0]} intensity={.5} distance={Math.max(w,d)*1.6} decay={1.6} color="#fff1dc"/>
      <OutdoorGround project={project}/>
      <Box size={[w+.09,.09,d+.09]} position={[0,-.047,0]} color="#d9d6cf" />
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.001,0]} receiveShadow><planeGeometry args={[w,d]}/><meshStandardMaterial map={floorTex} roughness={floorPresets[floor.material].kind==='marble'||floorPresets[floor.material].kind==='tile'?.45:.75}/></mesh>
      {WALL_NAMES.map(wall=><Wall key={wall} wall={wall} project={project} color={appearance.walls[wall]} opacity={opacityFor(wall)} holes={holes(wall)}/>)}
      {windows.map(win=>{const c=at(win.wall,win.start+win.width/2,0), ww=m(win.width), wh=m(win.height), sill=m(win.sill), T=m(wallThickness(project,win.wall))
        return <group key={win.id} position={[c.x,sill+wh/2,c.z]} rotation={[0,c.rotY,0]}>
          <mesh><boxGeometry args={[ww,wh,.012]}/><meshPhysicalMaterial color="#cfe7ee" transparent opacity={.25} roughness={.05} clearcoat={1} depthWrite={false}/></mesh>
          {[-1,1].map(s=><Box key={s} size={[.04,wh,Math.max(.05,T*.8)]} position={[s*(ww/2-.02),0,0]} color="#f6f7f3"/>)}
          <Box size={[ww,.04,Math.max(.05,T*.8)]} position={[0,wh/2-.02,0]} color="#f6f7f3"/>
          <Box size={[ww,.04,Math.max(.08,T*1.3)]} position={[0,-wh/2+.02,0]} color="#f6f7f3"/>
          <Box size={[.03,wh,.05]} position={[0,0,0]} color="#f6f7f3"/>
        </group>})}
      {doors.map(dr=>dr.kind==='sliding'
        ?<SlidingDoor key={dr.id} project={project} door={dr} open={!!openDoors[dr.id]} onToggle={()=>onToggleDoor?.(dr.id)}/>
        :<DoorAssembly key={dr.id} project={project} door={dr} open={!!openDoors[dr.id]} onToggle={()=>onToggleDoor?.(dr.id)}/>)}
      {ac&&(()=>{const c=at(ac.wall,ac.start+ac.width/2,wallInset(project,ac.wall)+11);return <group position={[c.x,m(ac.mount+ac.height/2),c.z]} rotation={[0,c.rotY,0]}>
        <Box size={[m(ac.width),m(ac.height),.2]} position={[0,0,0]} color="#f2efe8" roughness={.5}/>
        <Box size={[m(ac.width)*.9,.012,.02]} position={[0,-m(ac.height)/2+.03,(ac.wall==='top'||ac.wall==='left'?1:-1)*.1]} color="#c9c5bc"/>
      </group>})()}
      {furniture.map(item=><SceneFurniture key={item.id} item={item} roomWidth={W} roomDepth={D} sceneKey={sceneKey} supportHeight={furniture.find(f=>f.id===item.supportId)?.height??0} hasMonitor={furniture.some(f=>f.kind==='monitor'&&f.supportId===item.id)}/>)}
      <CameraRig view={mode} w={w} d={d} h={h} resetKey={resetKey} front={front} roomId={project.id}/>
      <OrbitControls makeDefault enableDamping dampingFactor={.09} rotateSpeed={mode==='inside'?.45:.75} zoomSpeed={.9} panSpeed={.85} screenSpacePanning enablePan={mode!=='inside'} enableZoom={mode!=='inside'}/>
    </Canvas>
    {mode==='inside'&&<div className="view-hint">{COARSE?'Drag to look around · Use the arrows to walk':'Drag to look around · Scroll or W A S D to walk'}</div>}
    {mode==='inside'&&<div className="walk-pad" aria-label="Walk">
      {([['↑',{forward:.3},'Step forward'],['←',{side:-.3},'Step left'],['↓',{forward:-.3},'Step back'],['→',{side:.3},'Step right']] as const).map(([label,detail,title])=>
        <button key={title} title={title} aria-label={title} onClick={()=>window.dispatchEvent(new CustomEvent('roomform:walk',{detail}))}>{label}</button>)}
    </div>}
    <div className="view-controls">
      {doors.length>0&&onToggleAll&&<button onClick={onToggleAll} title={anyOpen?'Close doors':'Open doors'}><DoorOpen size={14}/> {anyOpen?(doors.length>1?'Close doors':'Close door'):(doors.length>1?'Open doors':'Open door')}</button>}
      {onReset&&<button onClick={onReset} title="Reset view"><RotateCcw size={14}/> Reset view</button>}
    </div>
  </div>
}
/** The wall the Exterior View faces: the first glass wall, else the bottom wall. */
export function frontWall(project:Project):WallName { return WALL_NAMES.find(w=>project.walls[w].type==='glass') ?? 'bottom' }
