import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useModalLayer } from './ui'
import './onboarding.css'

/* ------------------------------------------------------------------ *
 *  Onboarding state — a small, versioned flag kept apart from room
 *  data. It never reads or writes `roomform-studio`.
 * ------------------------------------------------------------------ */
export const ONBOARDING_KEY = 'roomform-onboarding'
export const ONBOARDING_VERSION = 1
export type OnboardingStatus = 'completed' | 'skipped'

export function readOnboarding(): { version: number; status: OnboardingStatus } | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    return v && typeof v.version === 'number' && (v.status === 'completed' || v.status === 'skipped') ? v : null
  } catch { return null }
}
export function writeOnboarding(status: OnboardingStatus) {
  try { localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ version: ONBOARDING_VERSION, status, at: Date.now() })) } catch { /* storage unavailable: the tour simply may show again */ }
}

export const prefersReducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }
const at = (delay: number, dur?: number) => ({ '--d': `${delay}s`, ...(dur ? { '--t': `${dur}s` } : {}) }) as CSSProperties

/* ------------------------------------------------------------------ *
 *  Welcome splash — shown on every fresh page load (~3 s).
 * ------------------------------------------------------------------ */
const SPLASH_MS = 2550, SPLASH_EXIT_MS = 520, SPLASH_REDUCED_MS = 1300

export function WelcomeSplash({ onLeave, onDone }: { onLeave: () => void; onDone: () => void }) {
  const reduced = useRef(prefersReducedMotion()).current
  const [leaving, setLeaving] = useState(false)
  const left = useRef(false)
  const cb = useRef({ onLeave, onDone }); cb.current = { onLeave, onDone }
  const leave = useCallback(() => {
    if (left.current) return
    left.current = true
    setLeaving(true)
    cb.current.onLeave()
    setTimeout(() => cb.current.onDone(), reduced ? 220 : SPLASH_EXIT_MS)
  }, [reduced])
  useEffect(() => {
    const t = setTimeout(leave, reduced ? SPLASH_REDUCED_MS : SPLASH_MS)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); leave() } }
    window.addEventListener('keydown', key)
    return () => { clearTimeout(t); window.removeEventListener('keydown', key) }
  }, [leave, reduced])
  return <div className={`splash ${leaving ? 'leaving' : ''}`} role="status" aria-label="Welcome to Roomform">
    <div className="splash-glow" aria-hidden/>
    <div className="splash-center">
      <svg className="splash-mark" viewBox="0 0 48 48" aria-hidden><path pathLength={1} d="M20 42H6V6h36v36H30"/><path pathLength={1} d="M20 42A10 10 0 0 1 30 32"/></svg>
      <h1 className="splash-word">roomform<span>.</span></h1>
      <span className="splash-rule" aria-hidden/>
      <p className="splash-tag">Your space. Your vision. Beautifully designed.</p>
    </div>
    <button type="button" className="splash-skip" onClick={leave} aria-label="Skip introduction">Skip</button>
    <span className="splash-progress" aria-hidden><i/></span>
  </div>
}

/* ------------------------------------------------------------------ *
 *  Welcome invitation — shown after the splash on every load. The arrow
 *  and note live in a fixed-size block beside (desktop) or above (phone)
 *  the button, so the arrow always points at it.
 * ------------------------------------------------------------------ */
export function WelcomeInvite({ onTour, onSkip }: { onTour: () => void; onSkip: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [leaving, setLeaving] = useState(false)
  const done = useRef(false)
  const leave = (then: () => void) => {
    if (done.current) return
    done.current = true; setLeaving(true)
    setTimeout(then, prefersReducedMotion() ? 120 : 360)
  }
  useModalLayer(ref, () => leave(onSkip))
  return <div ref={ref} className={`invite ${leaving ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="invite-title" aria-describedby="invite-note">
    <div className="invite-center">
      <span className="invite-kicker">Interior design studio</span>
      <h1 id="invite-title" className="invite-title">Welcome to <span className="invite-word">roomform<i>.</i></span></h1>
      <p className="invite-tag">Your space. Your vision. Beautifully designed.</p>
      <div className="invite-cta">
        <div className="invite-hint">
          <p id="invite-note" className="invite-note">New here? Take a quick tour to discover how everything works.</p>
          <svg className="invite-arrow invite-arrow-side" viewBox="0 0 112 60" aria-hidden><path pathLength={1} d="M6 6c4 14 14 31 36 37 20 6 40 2 60-12"/><path pathLength={1} className="head" d="M91 25.5l11.5 5.5-6 11"/></svg>
          <svg className="invite-arrow invite-arrow-down" viewBox="0 0 74 64" aria-hidden><path pathLength={1} d="M4 10c18-8 40-6 50 8 8 11 7 25 1 40"/><path pathLength={1} className="head" d="M46 50l9 9 6-12"/></svg>
        </div>
        <button type="button" className="invite-tour" data-autofocus onClick={() => leave(onTour)}>Take the Tour <ArrowRight size={18}/></button>
        <span className="invite-spacer" aria-hidden/>
      </div>
      <button type="button" className="invite-skip" onClick={() => leave(onSkip)}>Skip for Now</button>
    </div>
  </div>
}

/* ------------------------------------------------------------------ *
 *  Tour content — edit the copy here; each step names its illustration.
 * ------------------------------------------------------------------ */
export type TourStep = { id: string; label: string; title: string; body: string; art: () => ReactNode; cycle: number }
export const TOUR_STEPS: TourStep[] = [
  { id: 'create', label: 'Create your space', title: 'Design any room you imagine.', body: "Start with your room's exact dimensions. Add doors, windows, walls, and choose beautiful flooring and finishes.", art: () => <ArtCreate/>, cycle: 7.2 },
  { id: 'furnish', label: 'Furnish your room', title: 'Make it yours.', body: 'Explore our furniture collection, customize exact measurements, and arrange everything with simple drag-and-drop controls.', art: () => <ArtFurnish/>, cycle: 7.2 },
  { id: 'view', label: 'See it come to life', title: 'From floor plan to 3D.', body: 'Switch between precise 2D layouts and immersive 3D views to experience your space from every angle.', art: () => <ArtThreeD/>, cycle: 7.6 },
  { id: 'save', label: 'Save & share your designs', title: 'Every idea, beautifully saved.', body: 'Create multiple rooms, save different layouts, and export your designs with measurements to share or revisit anytime.', art: () => <ArtSave/>, cycle: 7.2 },
]

/* ------------------------------------------------------------------ *
 *  Tour
 * ------------------------------------------------------------------ */
export function OnboardingTour({ onFinish, steps = TOUR_STEPS }: { onFinish: (status: OnboardingStatus) => void; steps?: TourStep[] }) {
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const [leaving, setLeaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(false)
  const last = index === steps.length - 1
  const finish = useCallback((status: OnboardingStatus) => {
    if (done.current) return
    done.current = true
    setLeaving(true)
    setTimeout(() => onFinish(status), prefersReducedMotion() ? 120 : 380)
  }, [onFinish])
  useModalLayer(ref, () => finish('skipped'))
  const go = useCallback((to: number) => {
    if (to < 0 || to >= steps.length) return
    setDir(to > index ? 'next' : 'prev'); setIndex(to)
  }, [index, steps.length])
  const next = () => last ? finish('completed') : go(index + 1)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return
      if (e.key === 'ArrowRight') { e.preventDefault(); if (!last) go(index + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [go, index, last])
  // Horizontal swipe on the panel (buttons keep their own taps).
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => { if ((e.target as HTMLElement).closest('button')) return; swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId } }
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current; swipe.current = null
    if (!s || s.id !== e.pointerId) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) { if (dx < 0) { if (!last) go(index + 1) } else go(index - 1) }
  }
  const step = steps[index]
  return <div ref={ref} className={`ob ${leaving ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ob-title" aria-describedby="ob-body">
    <header className="ob-top">
      <span className="ob-brand" aria-hidden>roomform<span>.</span></span>
      <button type="button" className="ob-skip" onClick={() => finish('skipped')}>Skip tour</button>
    </header>
    <div className="ob-body">
      <div className="ob-panel" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipe.current = null }}>
        <OnboardingStep key={step.id} step={step} index={index} total={steps.length} dir={dir}/>
        <div className="ob-controls">
          <div className="ob-progress" role="group" aria-label={`Step ${index + 1} of ${steps.length}`}>
            {steps.map((s, i) => <button type="button" key={s.id} className={`ob-seg ${i === index ? 'on' : i < index ? 'past' : ''}`} onClick={() => go(i)} aria-label={`Go to step ${i + 1}: ${s.label}`} aria-current={i === index ? 'step' : undefined}><i/></button>)}
            <span className="ob-count">{index + 1} <em>of</em> {steps.length}</span>
          </div>
          <div className="ob-actions">
            <button type="button" className="ob-back" onClick={() => go(index - 1)} disabled={index === 0}><ArrowLeft size={17}/> Back</button>
            <button type="button" className={`ob-next ${last ? 'ob-start' : ''}`} onClick={next} data-autofocus>{last ? 'Start Designing' : 'Continue'} <ArrowRight size={17}/></button>
          </div>
        </div>
      </div>
    </div>
  </div>
}

export function OnboardingStep({ step, index, total, dir }: { step: TourStep; index: number; total: number; dir: 'next' | 'prev' }) {
  // Illustrations loop by remounting, so every animation is a simple one-shot.
  const [cycle, setCycle] = useState(0)
  useEffect(() => {
    if (prefersReducedMotion()) return
    const t = setInterval(() => setCycle(c => c + 1), step.cycle * 1000)
    return () => clearInterval(t)
  }, [step.cycle])
  return <>
    <div className={`ob-art ob-enter-${dir}`} aria-hidden>
      <div className="ob-scene" key={cycle} style={{ '--cycle': `${step.cycle}s` } as CSSProperties}>{step.art()}</div>
    </div>
    <div className={`ob-copy ob-enter-${dir}`} aria-live="polite">
      <span className="ob-kicker">Step {index + 1} of {total} · {step.label}</span>
      <h2 id="ob-title">{step.title}</h2>
      <p id="ob-body">{step.body}</p>
    </div>
  </>
}

/* ------------------------------------------------------------------ *
 *  Illustrations (inline SVG + CSS, no assets)
 * ------------------------------------------------------------------ */
const INK = '#2f4a3c', SAGE = '#7f9e84', SAGE_D = '#365d50'

function Planks({ id, h = 200 }: { id: string; h?: number }) {
  return <pattern id={id} width="22" height={h} patternUnits="userSpaceOnUse">
    <rect width="22" height={h} fill="#eadfcb"/><path d={`M22 0V${h}`} stroke="#ddcdb2" strokeWidth="1.1"/><path d="M0 46H22M0 128H22" stroke="#e1d3bb" strokeWidth=".9"/>
  </pattern>
}

function ArtCreate() {
  return <svg viewBox="0 0 400 300">
    <defs><Planks id="ob-pl1"/></defs>
    <rect className="fx-fade" style={at(.15, .9)} x="80" y="60" width="240" height="170" fill="url(#ob-pl1)"/>
    <path className="fx-draw" style={at(.35, 1.5)} d="M150 230H80V60H320V230H190" pathLength={1} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="square"/>
    <g className="fx-fade" style={at(1.7)}><rect x="205" y="56.5" width="72" height="7" fill="#f7f8f3" stroke={SAGE} strokeWidth="1.4"/><path d="M205 60H277" stroke={SAGE} strokeWidth="1"/></g>
    <g className="fx-fade" style={at(1.95)}><path d="M150 230A40 40 0 0 1 190 190" fill="none" stroke="#a5b8a5" strokeWidth="1.2" strokeDasharray="3 3"/></g>
    <line className="a1-leaf" style={at(2)} x1="190" y1="230" x2="150" y2="230" stroke={INK} strokeWidth="3" strokeLinecap="round"/>
    <g className="fx-fade" style={at(2.5)}>
      <path d="M80 36V46M320 36V46M80 41H320" stroke={SAGE} strokeWidth="1.2"/>
      <rect x="171" y="31" width="58" height="20" rx="10" fill="#fbfaf6" stroke="#dbe4d6"/>
      <text x="200" y="45" textAnchor="middle" className="t-dim">420 cm</text>
    </g>
    <g className="fx-fade" style={at(2.75)}>
      <path d="M337 60H347M337 230H347M342 60V230" stroke={SAGE} strokeWidth="1.2"/>
      <g transform="translate(342 145) rotate(90)"><rect x="-29" y="-10" width="58" height="20" rx="10" fill="#fbfaf6" stroke="#dbe4d6"/><text y="4" textAnchor="middle" className="t-dim">300 cm</text></g>
    </g>
    <g className="fx-rise ob-card" style={at(3.3)}>
      <rect x="190" y="244" width="186" height="46" rx="12" fill="#fff" stroke="#e1e8dd"/>
      <text x="206" y="261" className="t-cap">ROOM SIZE</text>
      <text x="206" y="280" className="t-strong">420 × 300 cm</text>
      <circle cx="354" cy="267" r="10" fill={SAGE_D}/><path d="M349.5 267l3 3 5.5-6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
    <g className="fx-rise ob-card" style={at(3.6)}>
      <rect x="22" y="244" width="150" height="46" rx="12" fill="#fff" stroke="#e1e8dd"/>
      <rect x="34" y="256" width="22" height="22" rx="6" fill="url(#ob-pl1)" stroke="#d9cbb2"/>
      <text x="66" y="263" className="t-cap">FLOORING</text>
      <text x="66" y="280" className="t-strong">Light oak</text>
    </g>
  </svg>
}

function Bed({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <g>
    <rect x={x} y={y} width={w} height={h} rx="5" fill="#fff" stroke="#c9d3c6" strokeWidth="1.4"/>
    <rect x={x} y={y} width={w} height="10" rx="4" fill="#cdbba0"/>
    <rect x={x + 8} y={y + 14} width={w / 2 - 12} height="18" rx="5" fill="#f1ede5" stroke="#ddd5c8"/>
    <rect x={x + w / 2 + 4} y={y + 14} width={w / 2 - 12} height="18" rx="5" fill="#f1ede5" stroke="#ddd5c8"/>
    <path d={`M${x + 3} ${y + h * .55}H${x + w - 3}V${y + h - 3}H${x + 3}Z`} fill="#c8d8c7"/>
  </g>
}

function ArtFurnish() {
  return <svg viewBox="0 0 400 300">
    <defs><Planks id="ob-pl2"/></defs>
    <rect x="80" y="60" width="240" height="170" fill="url(#ob-pl2)"/>
    <path d="M150 230H80V60H320V230H190" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="square"/>
    <ellipse cx="190" cy="150" rx="58" ry="34" fill="#dfe7da" opacity=".85"/>
    <g className="fx-fade" style={at(.2)}><rect x="86" y="92" width="30" height="96" rx="7" fill="#9fb5a2"/><rect x="86" y="92" width="11" height="96" rx="5" fill="#86a08b"/></g>
    <g className="fx-fade" style={at(.35)}><rect x="181" y="67" width="16" height="16" rx="3" fill="#cdbba0"/><rect x="293" y="67" width="16" height="16" rx="3" fill="#cdbba0"/></g>
    {/* Library tray */}
    <g className="fx-fade" style={at(.1)}>
      <rect x="12" y="72" width="54" height="150" rx="14" fill="#fff" stroke="#e1e8dd"/>
      <rect className="a2-pick" style={at(.6)} x="18" y="80" width="42" height="42" rx="10" fill="#eef4ec" stroke={SAGE} strokeWidth="1.4"/>
      <rect x="28" y="88" width="22" height="26" rx="3" fill="#fff" stroke="#b9c7b8"/><rect x="28" y="88" width="22" height="5" rx="2" fill="#cdbba0"/>
      <rect x="27" y="140" width="24" height="12" rx="4" fill="#9fb5a2"/><rect x="27" y="140" width="24" height="5" rx="2" fill="#86a08b"/>
      <circle cx="39" cy="194" r="9" fill="#efe6d4" stroke="#cdbba0"/><circle cx="39" cy="194" r="3" fill="#cdbba0"/>
    </g>
    <g className="a2-bed" style={at(.9)}><Bed x={200} y={66} w={90} h={104}/></g>
    <g className="fx-out" style={at(2.55, .35)}><circle className="a2-finger" style={at(.9)} cx="245" cy="122" r="13" fill="#365d5033" stroke={SAGE_D} strokeWidth="1.5"/></g>
    <g className="fx-fade" style={at(2.7)}>
      <rect x="195" y="61" width="100" height="114" rx="6" fill="none" stroke={SAGE_D} strokeWidth="1.5" strokeDasharray="5 4"/>
      {[[195, 61], [295, 61], [195, 175], [295, 175]].map(([cx, cy]) => <rect key={`${cx}${cy}`} x={cx - 4} y={cy - 4} width="8" height="8" rx="2" fill="#fff" stroke={SAGE_D} strokeWidth="1.5"/>)}
    </g>
    <g className="fx-rise" style={at(3.1)}>
      <rect x="198" y="128" width="94" height="22" rx="11" fill={SAGE_D}/>
      <text x="245" y="143" textAnchor="middle" className="t-chip">160 × 200 cm</text>
    </g>
    <g className="fx-rise ob-card" style={at(3.4)}><g transform="translate(0 50)">
      <rect x="166" y="194" width="158" height="38" rx="19" fill="#22382b"/>
      <g stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M185 220l12-12M190 208h7v7M185 213v7h7"/>
        <path d="M233 207a7 7 0 1 0 5 3M238 205v5h-5"/>
        <rect x="267" y="206" width="10" height="10" rx="2"/><path d="M271 216v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/>
        <path d="M300 208h12M304 208v-2h4v2M302 208l1 12h6l1-12"/>
      </g>
      <path d="M216 203v20M255 203v20M290 203v20" stroke="#ffffff2a"/>
    </g></g>
  </svg>
}

function ArtThreeD() {
  // Isometric projection used by the morph: rotate(45°) then scaleY(.58).
  return <svg viewBox="0 0 400 300">
    <defs><Planks id="ob-pl3" h={160}/></defs>
    <g className="fx-fade" style={at(3.05)}>
      <ellipse cx="200" cy="262" rx="150" ry="18" fill="#26402f" opacity=".08"/>
    </g>
    <g className="a3-iso" style={at(1.3, 1.5)}>
      <rect x="-100" y="-80" width="200" height="160" fill="url(#ob-pl3)"/>
      <ellipse cx="0" cy="20" rx="46" ry="34" fill="#dfe7da"/>
      <rect x="-30" y="-80" width="70" height="90" rx="4" fill="#fff" stroke="#c9d3c6" strokeWidth="1.4"/>
      <rect x="-30" y="-80" width="70" height="9" rx="3" fill="#cdbba0"/>
      <path d="M-27 -30H37V7H-27Z" fill="#c8d8c7"/>
      <rect x="-95" y="5" width="24" height="68" rx="6" fill="#9fb5a2"/>
      <rect x="60" y="45" width="36" height="30" rx="4" fill="#cdbba0"/>
      <rect x="-100" y="-80" width="200" height="160" fill="none" stroke={INK} strokeWidth="6"/>
      <path d="M-10 -80H40" stroke="#f7f8f3" strokeWidth="3"/>
    </g>
    <g transform="translate(200 182)">
      <g className="a3-rise" style={at(2.65)}>
        <polygon points="-14,-74 127,8 127,-62 -14,-144" fill="#efe9de" stroke="#d8d0c1" strokeWidth="1"/>
        <polygon points="-14,-74 -127,-8 -127,-78 -14,-144" fill="#e4ddcf" stroke="#d3cab9" strokeWidth="1"/>
        <polygon points="49.5,-62 84.7,-41.6 84.7,-66.6 49.5,-87" fill="#dde8e5" stroke="#c4d2cd"/>
        <path d="M67.1 -52 V-77" stroke="#c4d2cd"/>
      </g>
      <g className="a3-rise" style={at(2.95)}>
        <polygon points="84.9,-16.4 21.2,20.5 21.2,6.5 84.9,-30.4" fill="#d8ccb7"/>
        <polygon points="21.2,20.5 -28.3,-8.2 -28.3,-22.2 21.2,6.5" fill="#e7ddcb"/>
        <polygon points="35.4,-59.1 84.9,-30.4 21.2,6.5 -28.3,-22.2" fill="#fbfaf6" stroke="#d9d3c6"/>
        <polygon points="2.1,-37.4 47.4,-11.1 21.2,4 -24,-22.2" fill="#c8d8c7" opacity=".9"/>
        <polygon points="35.4,-59.1 84.9,-30.4 84.9,-50.4 35.4,-79.1" fill="#cdbba0"/>
      </g>
    </g>
    <g className="a3-pill">
      <rect x="146" y="14" width="108" height="30" rx="15" fill="#fff" stroke="#e1e8dd"/>
      <rect className="a3-knob" style={at(1.3, .6)} x="149" y="17" width="51" height="24" rx="12" fill={SAGE_D}/>
      <text className="a3-l2d" style={at(1.3, .6)} x="174.5" y="33.5" textAnchor="middle">2D</text>
      <text className="a3-l3d" style={at(1.3, .6)} x="225.5" y="33.5" textAnchor="middle">3D</text>
    </g>
  </svg>
}

function MiniPlan({ x, y, variant }: { x: number; y: number; variant: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect width="58" height="54" rx="8" fill="#efe9dd"/>
    <rect x="9" y="9" width="40" height="36" fill="#f6f1e7" stroke={INK} strokeWidth="2.2"/>
    {variant === 0 && <><rect x="20" y="12" width="18" height="20" rx="2" fill="#fff" stroke="#c9d3c6"/><rect x="20" y="12" width="18" height="4" fill="#cdbba0"/></>}
    {variant === 1 && <><rect x="12" y="14" width="7" height="24" rx="2" fill="#9fb5a2"/><rect x="25" y="22" width="14" height="9" rx="2" fill="#cdbba0"/></>}
    {variant === 2 && <><rect x="12" y="12" width="15" height="17" rx="2" fill="#fff" stroke="#c9d3c6"/><rect x="31" y="31" width="14" height="10" rx="2" fill="#9fb5a2"/></>}
  </g>
}

function ArtSave() {
  const cards = [
    { y: 34, name: 'Main Bedroom', sub: '3 saved designs', recent: true },
    { y: 120, name: 'Living Room', sub: '560 × 410 cm' },
    { y: 206, name: 'Garden Studio', sub: '380 × 320 cm' },
  ]
  return <svg viewBox="0 0 400 300">
    {cards.map((c, i) => <g key={c.name} className="fx-rise ob-card" style={at(.25 + i * .28)}>
      <rect x="16" y={c.y} width="166" height="72" rx="13" fill="#fff" stroke={c.recent ? '#bcd0bd' : '#e1e8dd'} strokeWidth={c.recent ? 1.6 : 1}/>
      <MiniPlan x={24} y={c.y + 9} variant={i}/>
      {c.recent && <text x="92" y={c.y + 24} className="t-recent">RECENTLY EDITED</text>}
      <text x="92" y={c.y + (c.recent ? 41 : 33)} className="t-strong sm">{c.name}</text>
      <text x="92" y={c.y + (c.recent ? 57 : 50)} className="t-sub">{c.sub}</text>
    </g>)}
    <g className="a4-sheet ob-card" style={at(1.3, .9)}>
      <rect x="196" y="22" width="188" height="256" rx="14" fill="#fff" stroke="#e1e8dd"/>
      <text x="212" y="46" className="t-cap">FLOOR PLAN · EXPORT</text>
      <g transform="translate(222 82)">
        <rect width="132" height="96" fill="#f6f1e7" stroke={INK} strokeWidth="3.2"/>
        <rect x="46" y="4" width="40" height="44" rx="3" fill="#fff" stroke="#c9d3c6"/><rect x="46" y="4" width="40" height="6" rx="2" fill="#cdbba0"/>
        <rect x="5" y="40" width="13" height="44" rx="3" fill="#9fb5a2"/>
        <rect x="100" y="62" width="26" height="28" rx="3" fill="#cdbba0"/>
      </g>
      <g className="fx-fade" style={at(2.2)}>
        <path d="M222 64V72M354 64V72M222 68H354" stroke={SAGE} strokeWidth="1.1"/>
        <rect x="267" y="60" width="42" height="16" rx="8" fill="#fff" stroke="#dbe4d6"/><text x="288" y="71.5" textAnchor="middle" className="t-dim sm">420 cm</text>
      </g>
      <g className="fx-fade" style={at(2.45)}>
        <path d="M364 82H372M364 178H372M368 82V178" stroke={SAGE} strokeWidth="1.1"/>
        <g transform="translate(368 130) rotate(90)"><rect x="-21" y="-8" width="42" height="16" rx="8" fill="#fff" stroke="#dbe4d6"/><text y="3.5" textAnchor="middle" className="t-dim sm">300 cm</text></g>
      </g>
      <g className="fx-fade" style={at(2.6)}>
        <path d="M222 198H330" stroke="#e8ece4" strokeWidth="6" strokeLinecap="round"/><path d="M222 212H300" stroke="#eef1ea" strokeWidth="6" strokeLinecap="round"/>
      </g>
      <g className="fx-rise" style={at(2.9)}>
        <rect x="212" y="232" width="156" height="32" rx="10" fill={SAGE_D}/>
        <path d="M258 241v10M253 247l5 5 5-5M252 256h12" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <text x="272" y="252.5" className="t-chip">Download PNG</text>
      </g>
    </g>
    <g className="fx-pop ob-card" style={at(3.5)}>
      <rect x="104" y="6" width="154" height="26" rx="13" fill="#22382b"/>
      <circle cx="121" cy="19" r="7" fill="#7f9e84"/><path d="M117.8 19l2.2 2.2 4-4.4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="134" y="23" className="t-chip">Saved to My Spaces</text>
    </g>
  </svg>
}
