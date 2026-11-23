import { useEffect, useRef, useState } from 'react'
import { Box, Download, LoaderCircle, Ruler, Square } from 'lucide-react'
import { Modal } from './ui'
import { activeLayout, type Project } from './model'
import { renderPlan } from './export'
import { ALL_INCLUDE, BASIC_INCLUDE, type MeasureInclude } from './measure'

export type ExportKind = 'clean' | 'dimensioned' | '3d'
export type ExportPrefs = { kind: ExportKind; include: MeasureInclude; detail: 'basic' | 'detailed' }
export const defaultExportPrefs: ExportPrefs = { kind: 'dimensioned', include: { ...ALL_INCLUDE }, detail: 'detailed' }
const LABELS: Record<keyof MeasureInclude, string> = {
  room: 'Room dimensions', furniture: 'Furniture dimensions', walls: 'Furniture-to-wall distances',
  pairs: 'Furniture-to-furniture distances', openings: 'Door / window dimensions', outdoor: 'Outdoor area dimensions',
}

/** Export image: clean plan, dimensioned plan (with live preview) or 3D screenshot. */
export function ExportDialog({ project, prefs, onPrefs, onDownload2D, onDownload3D, onClose }:
  { project: Project; prefs: ExportPrefs; onPrefs: (p: ExportPrefs) => void; onDownload2D: (p: ExportPrefs) => Promise<boolean>; onDownload3D: () => void; onClose: () => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [rendering, setRendering] = useState(false)
  const seq = useRef(0)
  const set = (patch: Partial<ExportPrefs>) => onPrefs({ ...prefs, ...patch })
  const allOn = Object.values(prefs.include).every(Boolean)
  // Re-render the preview (same renderer as the download, at reduced size) whenever settings change.
  useEffect(() => {
    if (prefs.kind === '3d') { setPreview(null); return }
    const id = ++seq.current; setRendering(true)
    const t = setTimeout(async () => {
      const canvas = await renderPlan(project, { dimensions: prefs.kind === 'dimensioned', include: prefs.include, detail: prefs.detail }, .42)
      if (id !== seq.current) return
      setPreview(canvas ? canvas.toDataURL('image/png') : null); setRendering(false)
    }, 160)
    return () => clearTimeout(t)
  }, [project, prefs])
  const download = async () => {
    if (prefs.kind === '3d') { onDownload3D(); return }
    setBusy(true); const ok = await onDownload2D(prefs); setBusy(false); if (ok) onClose()
  }
  const kinds: { k: ExportKind; title: string; text: string; icon: typeof Box }[] = [
    { k: 'clean', title: 'Clean plan', text: 'Floor plan without measurements', icon: Square },
    { k: 'dimensioned', title: 'With dimensions', text: 'Measured plan for a carpenter or designer', icon: Ruler },
    { k: '3d', title: '3D screenshot', text: 'The current 3D view', icon: Box },
  ]
  return <Modal title="Export Image" subtitle={`${project.name} · ${activeLayout(project).name}`} onClose={onClose} className="export-modal">
    <div className="modal-body export-body">
      <div className="export-kinds" role="radiogroup" aria-label="Export type">
        {kinds.map(({ k, title, text, icon: Icon }) => <button key={k} type="button" role="radio" aria-checked={prefs.kind === k} className={prefs.kind === k ? 'active' : ''} onClick={() => set({ kind: k })}>
          <Icon size={18} /><span><strong>{title}</strong><small>{text}</small></span></button>)}
      </div>
      {prefs.kind === 'dimensioned' && <div className="export-options">
        <div className="export-presets">
          <button type="button" className={prefs.detail === 'basic' && JSON.stringify(prefs.include) === JSON.stringify(BASIC_INCLUDE) ? 'active' : ''} onClick={() => set({ detail: 'basic', include: { ...BASIC_INCLUDE } })}>Basic measurements</button>
          <button type="button" className={prefs.detail === 'detailed' && allOn ? 'active' : ''} onClick={() => set({ detail: 'detailed', include: { ...ALL_INCLUDE } })}>Detailed measurements</button>
        </div>
        <label className="check-row all"><input type="checkbox" checked={allOn} onChange={e => set({ include: Object.fromEntries(Object.keys(prefs.include).map(k => [k, e.target.checked])) as MeasureInclude })} /> Select all measurements</label>
        <div className="check-grid">{(Object.keys(LABELS) as (keyof MeasureInclude)[]).map(k => <label key={k} className="check-row"><input type="checkbox" checked={prefs.include[k]} onChange={e => set({ include: { ...prefs.include, [k]: e.target.checked } })} /> {LABELS[k]}</label>)}</div>
      </div>}
      {prefs.kind !== '3d' ? <div className="export-preview" aria-live="polite">
        {preview ? <img src={preview} alt="Preview of the exported floor plan" /> : <span className="export-preview-empty">Rendering preview…</span>}
        {rendering && preview && <span className="export-preview-badge"><LoaderCircle size={12} className="spin" /> Updating</span>}
      </div> : <p className="modal-text">Saves the 3D view exactly as shown. If you are on the 2D plan, Roomform switches to 3D first.</p>}
      <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary-button" onClick={download} disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />} Download PNG</button></div>
    </div>
  </Modal>
}
