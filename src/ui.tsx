import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'

/** Numeric input that lets the user type freely and only reports values inside [min, max]. */
export function NumberField({label,value,onChange,min=0,max=10000,step=1,suffix='cm'}:{label:string;value:number;onChange:(v:number)=>void;min?:number;max?:number;step?:number;suffix?:string}) {
  const shown=Number.isFinite(value)?String(Math.round(value*10)/10):''
  const [text,setText]=useState(shown), [focused,setFocused]=useState(false)
  useEffect(()=>{if(!focused)setText(shown)},[shown,focused])
  const n=Number(text), bad=text.trim()===''||!Number.isFinite(n)||n<min||n>max
  return <label className={`number-field ${focused&&bad?'invalid':''}`}><span>{label}</span><div><input type="number" inputMode="decimal" value={text} min={min} max={max} step={step}
    onFocus={()=>setFocused(true)} onBlur={()=>{setFocused(false);setText(shown)}}
    onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur()}}
    onChange={e=>{setText(e.target.value);const v=Number(e.target.value);if(e.target.value.trim()!==''&&Number.isFinite(v)&&v>=min&&v<=max)onChange(v)}}/><small>{suffix}</small></div></label>
}
export function Segmented<T extends string>({value,options,onChange}:{value:T;options:{value:T;label:ReactNode}[];onChange:(v:T)=>void}) {
  return <div className="segmented">{options.map(o=><button key={o.value} type="button" className={value===o.value?'active':''} onClick={()=>onChange(o.value)}>{o.label}</button>)}</div>
}
/** Shared behaviour of every dialog layer: Escape closes only the topmost
 *  layer, focus moves into the dialog on open and back to the trigger on close,
 *  and Tab stays inside the dialog. */
const layers: number[] = []
let layerSeq = 0
export function useModalLayer(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose); close.current = onClose
  useEffect(() => {
    const id = ++layerSeq; layers.push(id)
    const before = document.activeElement as HTMLElement | null
    const el = ref.current
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('input,select,textarea,button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])') ?? [])
    // autofocus: an element marked data-autofocus, else the first input, else the first action button
    const raf = requestAnimationFrame(() => {
      const f = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('input,select,textarea') ?? focusables().find(b => !b.classList.contains('modal-close'))
      f?.focus({ preventScroll: true }); if (f instanceof HTMLInputElement && f.type === 'text') f.select()
    })
    const key = (e: KeyboardEvent) => {
      if (layers[layers.length - 1] !== id) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current() }
      else if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', key, true)
    document.body.classList.add('dialog-open')
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', key, true)
      const i = layers.indexOf(id); if (i >= 0) layers.splice(i, 1)
      if (!layers.length) document.body.classList.remove('dialog-open')
      before?.focus?.({ preventScroll: true })
    }
  }, [ref])
}
export const anyDialogOpen = () => layers.length > 0
/** Publishes the visible viewport (minus on-screen keyboard and toolbars) as
 *  --vvh / --vvt so dialogs can size and position themselves above it. */
if (typeof window !== 'undefined' && window.visualViewport) {
  const vv = window.visualViewport
  const sync = () => { const r = document.documentElement.style; r.setProperty('--vvh', `${Math.round(vv.height)}px`); r.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`) }
  vv.addEventListener('resize', sync); vv.addEventListener('scroll', sync); sync()
}
export function Modal({title,subtitle,children,onClose,className='',tone,sheet=false,leading}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void;className?:string;tone?:'danger';sheet?:boolean;leading?:ReactNode}) {
  const ref = useRef<HTMLDivElement>(null)
  useModalLayer(ref, onClose)
  const titleId = useId()
  return <div className={`modal-backdrop ${sheet?'as-sheet':''}`} onPointerDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div ref={ref} className={`modal ${className} ${tone==='danger'?'modal-danger':''}`} role={tone==='danger'?'alertdialog':'dialog'} aria-modal="true" aria-labelledby={titleId}>
      <div className="modal-head">{leading&&<span className="modal-leading">{leading}</span>}<div><h2 id={titleId}>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X size={17}/></button></div>
      {children}
    </div>
  </div>
}
/** Yes/no confirmation. Destructive actions get a red primary button. */
export function ConfirmDialog({title,message,confirmLabel='Confirm',cancelLabel='Cancel',danger=false,details,onConfirm,onCancel}:{title:string;message:ReactNode;confirmLabel?:string;cancelLabel?:string;danger?:boolean;details?:string[];onConfirm:()=>void;onCancel:()=>void}) {
  return <Modal title={title} onClose={onCancel} tone={danger?'danger':undefined}>
    <div className="modal-body">
      <p className="modal-text">{message}</p>
      {details&&details.length>0&&<ul className="modal-list">{details.map(d=><li key={d}>{d}</li>)}</ul>}
      <div className="modal-actions"><button type="button" className="ghost-button" data-autofocus={danger?true:undefined} onClick={onCancel}>{cancelLabel}</button><button type="button" data-autofocus={danger?undefined:true} className={danger?'danger-button':'primary-button'} onClick={onConfirm}>{confirmLabel}</button></div>
    </div>
  </Modal>
}
/** Single text input (rename, name a new design…). Enter submits, Escape cancels. */
export function InputDialog({title,message,label,initial='',placeholder,confirmLabel='Save Changes',validate,onSubmit,onCancel}:{title:string;message?:string;label:string;initial?:string;placeholder?:string;confirmLabel?:string;validate?:(v:string)=>string|null;onSubmit:(v:string)=>void;onCancel:()=>void}) {
  const [value,setValue]=useState(initial), [error,setError]=useState('')
  const submit=()=>{const v=value.trim();const err=!v?'Please enter a name.':validate?.(v)??null;if(err){setError(err);return}onSubmit(v)}
  return <Modal title={title} subtitle={message} onClose={onCancel}>
    <form className="modal-body" onSubmit={e=>{e.preventDefault();submit()}} noValidate>
      <label className="modal-text-field"><span>{label}</span><input type="text" enterKeyHint="done" value={value} placeholder={placeholder} maxLength={80} aria-invalid={!!error} onChange={e=>{setValue(e.target.value);setError('')}}/></label>
      {error&&<div className="modal-error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button">{confirmLabel}</button></div>
    </form>
  </Modal>
}
type ConfirmOpts={title:string;message:ReactNode;confirmLabel?:string;cancelLabel?:string;danger?:boolean;details?:string[]}
type PromptOpts={title:string;message?:string;label:string;initial?:string;placeholder?:string;confirmLabel?:string;validate?:(v:string)=>string|null}
type Pending={kind:'confirm';opts:ConfirmOpts;resolve:(v:boolean)=>void}|{kind:'prompt';opts:PromptOpts;resolve:(v:string|null)=>void}
/** Promise-based replacements for window.confirm / window.prompt that render
 *  the app's own dialogs:  if (await dialogs.confirm({...})) ... */
export function useDialogs() {
  const [pending,setPending]=useState<Pending|null>(null)
  const confirm=useCallback((opts:ConfirmOpts)=>new Promise<boolean>(resolve=>setPending({kind:'confirm',opts,resolve})),[])
  const prompt=useCallback((opts:PromptOpts)=>new Promise<string|null>(resolve=>setPending({kind:'prompt',opts,resolve})),[])
  const element=pending?.kind==='confirm'
    ?<ConfirmDialog {...pending.opts} onConfirm={()=>{pending.resolve(true);setPending(null)}} onCancel={()=>{pending.resolve(false);setPending(null)}}/>
    :pending?.kind==='prompt'
    ?<InputDialog {...pending.opts} onSubmit={v=>{pending.resolve(v);setPending(null)}} onCancel={()=>{pending.resolve(null);setPending(null)}}/>
    :null
  return {confirm,prompt,element,open:!!pending}
}
/** Small non-blocking notification. Errors stay a little longer. */
export function Toast({message,tone='info',onClose}:{message:string;tone?:'info'|'success'|'error';onClose:()=>void}) {
  useEffect(()=>{const t=setTimeout(onClose,tone==='error'?6500:4200);return()=>clearTimeout(t)},[message,tone,onClose])
  return <div className={`toast toast-${tone}`} role={tone==='error'?'alert':'status'} aria-live="polite"><span>{message}</span><button type="button" onClick={onClose} aria-label="Dismiss"><X size={16}/></button></div>
}
export function Collapsible({title,icon,summary,children,open=false}:{title:string;icon:ReactNode;summary?:string;children:ReactNode;open?:boolean}) {
  return <details className="collapsible" open={open}><summary>{icon}<span>{title}</span>{summary&&<small>{summary}</small>}<ChevronDown size={15} className="chev"/></summary><div className="collapsible-body">{children}</div></details>
}

