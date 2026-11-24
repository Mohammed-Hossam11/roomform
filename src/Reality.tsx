import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { LogOut } from 'lucide-react'
import type { RealitySession, Quality } from './realityEngine'
import type { CameraView } from './Room3D'
import './reality.css'

export type RealityQuality = Quality
/** What the user asked for: a fixed quality, or `auto` (decided from the GPU). */
export type RealityRequest = 'auto' | RealityQuality
export type RealityStatus =
  | { phase: 'loading'; pct: number; label: string }
  | { phase: 'ready'; quality: RealityQuality }
  | { phase: 'error'; reason: string }

export const REALITY_PREF_KEY = 'roomform-reality-quality'
export function readRealityPref(): RealityRequest {
  try { const v = localStorage.getItem(REALITY_PREF_KEY); return v === 'high' || v === 'balanced' ? v : 'auto' } catch { return 'auto' }
}
export function saveRealityPref(q: RealityQuality) { try { localStorage.setItem(REALITY_PREF_KEY, q) } catch { /* optional preference */ } }
/** Reality Mode is offered on laptops/desktops only: a fine pointer that can hover, and a wide screen. */
export const realityCapableDevice = () => {
  try { return window.matchMedia('(pointer: fine) and (hover: hover)').matches && window.innerWidth > 820 } catch { return false }
}

const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()))
// Share of the progress bar for the steps the rig itself runs; the session reports the rest.
const RIG_LOAD = .1, RIG_SETUP = .04

/** Lives inside the <Canvas>. Prepares the enhanced scene, reports real
 *  progress, then takes over rendering. Unmounting restores everything. */
export function RealityRig({ request, onStatus, onLights, onDpr }: { request: RealityRequest; onStatus: (s: RealityStatus) => void; onLights: (on: boolean) => void; onDpr: (dpr: number | null) => void }) {
  const { gl, scene, camera, size, viewport } = useThree()
  const session = useRef<RealitySession | null>(null)
  const [live, setLive] = useState(false)
  const cb = useRef({ onStatus, onLights, onDpr }); cb.current = { onStatus, onLights, onDpr }
  useEffect(() => {
    let cancelled = false
    const report = (pct: number, label: string) => { if (!cancelled) cb.current.onStatus({ phase: 'loading', pct: Math.round(pct * 100), label }) }
    ;(async () => {
      try {
        report(0, 'Loading the rendering engine')
        await frame(); await frame() // let the overlay paint before any heavy work
        const engine = await import('./realityEngine')
        if (cancelled) return
        report(RIG_LOAD, 'Checking your graphics')
        const support = engine.checkSupport(gl)
        if (!support.ok) { cb.current.onStatus({ phase: 'error', reason: support.reason }); return }
        const quality: RealityQuality = request === 'auto' ? support.suggested : request
        cb.current.onDpr(engine.pixelRatioFor(quality))
        engine.initAreaLights()
        cb.current.onLights(true)
        await frame(); await frame() // daylight rig is committed to the scene
        if (cancelled) return
        report(RIG_LOAD + RIG_SETUP, 'Preparing')
        const s = new engine.RealitySession(gl, scene, camera, quality)
        session.current = s
        const share = 1 - RIG_LOAD - RIG_SETUP
        await s.prepare((done, label) => report(RIG_LOAD + RIG_SETUP + done * share, label), () => cancelled)
        if (cancelled) return
        setLive(true)
        cb.current.onStatus({ phase: 'ready', quality })
      } catch (e) {
        if (cancelled || (e as DOMException)?.name === 'AbortError') return
        console.error('Reality Mode failed to start', e)
        session.current?.dispose(); session.current = null
        cb.current.onLights(false); cb.current.onDpr(null)
        cb.current.onStatus({ phase: 'error', reason: 'Something went wrong while preparing the enhanced scene on this device.' })
      }
    })()
    return () => {
      cancelled = true
      session.current?.dispose(); session.current = null
      setLive(false); cb.current.onLights(false); cb.current.onDpr(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])
  useEffect(() => { session.current?.setSize(size.width, size.height) }, [size.width, size.height, viewport.dpr])
  useEffect(() => {
    const lost = (e: Event) => { e.preventDefault(); cb.current.onStatus({ phase: 'error', reason: 'The graphics processor stopped responding.' }) }
    gl.domElement.addEventListener('webglcontextlost', lost)
    return () => gl.domElement.removeEventListener('webglcontextlost', lost)
  }, [gl])
  return live ? <RealityLoop session={session} onFail={() => cb.current.onStatus({ phase: 'error', reason: 'Rendering failed on this device.' })}/> : null
}

/** Mounted only when ready: a positive-priority frame callback, so this chain
 *  replaces R3F's default render. */
function RealityLoop({ session, onFail }: { session: React.RefObject<RealitySession | null>; onFail: () => void }) {
  const failed = useRef(false)
  useFrame((_, dt) => {
    if (failed.current) return
    try { session.current?.render(dt) } catch (e) { failed.current = true; console.error(e); onFail() }
  }, 1)
  return null
}

function Sparkle({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden><path d="M12 2.5c.5 4.6 2.4 7 7.5 9.5-5.1 2.5-7 4.9-7.5 9.5-.5-4.6-2.4-7-7.5-9.5 5.1-2.5 7-4.9 7.5-9.5Z"/></svg>
}

/** Full-view loading / error overlay. Fades out once the scene is ready. */
export function RealityOverlay({ status, onBack }: { status: RealityStatus | null; onBack: () => void }) {
  const [gone, setGone] = useState(false)
  const ready = status?.phase === 'ready'
  useEffect(() => { if (!ready) { setGone(false); return } const t = setTimeout(() => setGone(true), 1100); return () => clearTimeout(t) }, [ready])
  if (!status || gone) return null
  const pct = status.phase === 'loading' ? status.pct : 100
  return <div className={`reality-overlay ${ready ? 'done' : ''}`} role={status.phase === 'error' ? 'alertdialog' : 'status'} aria-live="polite" aria-label="Reality Mode">
    <div className="reality-card">
      <div className="reality-mark"><Sparkle className="reality-spark s1"/><Sparkle className="reality-spark s2"/><Sparkle className="reality-spark s3"/></div>
      <div className="reality-logo">roomform<span>.</span></div>
      {status.phase === 'error' ? <>
        <h2 className="reality-title">Reality Mode isn't available here</h2>
        <p className="reality-reason">{status.reason} Your room is unchanged, and the standard 3D view works as usual.</p>
        <button type="button" className="reality-back" onClick={onBack} autoFocus>Back to 3D view</button>
      </> : <>
        <p className="reality-title">Bringing your space to life...</p>
        <div className="reality-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Preparing Reality Mode"><i style={{ transform: `scaleX(${pct / 100})` }}/></div>
        <div className="reality-meta"><span>{status.phase === 'loading' ? status.label : 'Ready'}</span><strong>{pct}%</strong></div>
      </>}
    </div>
  </div>
}

const CAMS: [CameraView, string][] = [['overview', 'Overview'], ['inside', 'Inside Room'], ['top', 'Top View']]
export function RealityBar({ quality, camera, onCamera, onQuality, onExit }: { quality: RealityQuality | null; camera: CameraView; onCamera: (v: CameraView) => void; onQuality: (q: RealityQuality) => void; onExit: () => void }) {
  return <div className="reality-ui">
    <div className="reality-badge"><Sparkle/> Reality</div>
    <div className="reality-group" role="group" aria-label="Camera">
      {CAMS.map(([v, label]) => <button key={v} type="button" className={camera === v ? 'on' : ''} onClick={() => onCamera(v)}>{label}</button>)}
    </div>
    <div className="reality-group" role="group" aria-label="Quality">
      {(['high', 'balanced'] as const).map(q => <button key={q} type="button" className={quality === q ? 'on' : ''} onClick={() => quality !== q && onQuality(q)}>{q === 'high' ? 'High' : 'Balanced'}</button>)}
    </div>
    <button type="button" className="reality-exit" onClick={onExit}><LogOut size={15}/> Exit Reality</button>
  </div>
}
