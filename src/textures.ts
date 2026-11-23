import { floorPresets, type FloorMaterial } from './model'

/** Procedural, seamlessly tiling floor textures. One texture tile covers
 *  TILE_CM × TILE_CM of real floor, so the gallery preview, the 2D plan, the
 *  PNG export and the 3D floor all show the same material at the same scale. */
export const TILE_CM = 120
export const TEX_PX = 512

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 } }
function rgb(hex: string) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
function shade(hex: string, f: number, add = 0) { const [r, g, b] = rgb(hex); const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f + add))); return `rgb(${c(r)},${c(g)},${c(b)})` }

const cache = new Map<string, HTMLCanvasElement>()
export function floorCanvas(material: FloorMaterial, baseColor: string): HTMLCanvasElement {
  const key = `${material}|${baseColor}`
  const hit = cache.get(key); if (hit) return hit
  const S = TEX_PX, cm = S / TILE_CM
  const cv = document.createElement('canvas'); cv.width = cv.height = S
  const c = cv.getContext('2d')!
  const kind = floorPresets[material]?.kind ?? 'plain'
  const rand = rng(material.length * 977 + parseInt(baseColor.slice(1), 16) % 1000)
  c.fillStyle = baseColor; c.fillRect(0, 0, S, S)
  if (kind === 'wood') {
    const plankH = 20 * cm, rows = Math.round(S / plankH), h = S / rows
    for (let r = 0; r < rows; r++) {
      const y = r * h
      // Each row has one or two butt joints; planks wrap horizontally so the tile is seamless.
      const joint = rand() * S, joints = rand() > .45 ? [joint, (joint + S / 2 + (rand() - .5) * S * .3) % S] : [joint]
      const segs = [...joints].sort((a, b) => a - b)
      for (let i = 0; i < segs.length; i++) {
        const x0 = segs[i], x1 = i + 1 < segs.length ? segs[i + 1] : segs[0] + S
        const f = .9 + rand() * .18
        for (const off of [0, -S]) {
          c.fillStyle = shade(baseColor, f); c.fillRect(x0 + off, y, x1 - x0, h)
          // grain: long soft sinusoids that complete whole periods across the tile
          c.save(); c.beginPath(); c.rect(x0 + off, y, x1 - x0, h); c.clip()
          for (let g = 0; g < 9; g++) {
            const gy = y + rand() * h, amp = 1 + rand() * 3, per = [1, 2, 3][Math.floor(rand() * 3)], ph = rand() * 6.28
            c.strokeStyle = shade(baseColor, f * (.78 + rand() * .12)); c.globalAlpha = .18 + rand() * .22; c.lineWidth = .6 + rand() * 1.2
            c.beginPath()
            for (let x = x0 + off; x <= x1 + off; x += 6) { const yy = gy + Math.sin((x / S) * per * 6.283 + ph) * amp; if (x === x0 + off) c.moveTo(x, yy); else c.lineTo(x, yy) }
            c.stroke()
          }
          if (rand() > .55) { // a small knot
            const kx = x0 + off + 20 + rand() * Math.max(1, x1 - x0 - 40), ky = y + h * (.3 + rand() * .4)
            c.globalAlpha = .25; c.strokeStyle = shade(baseColor, f * .7); c.lineWidth = 1
            for (let k = 1; k < 4; k++) { c.beginPath(); c.ellipse(kx, ky, 5 * k, 1.6 * k, 0, 0, 6.283); c.stroke() }
          }
          c.restore(); c.globalAlpha = 1
          c.fillStyle = shade(baseColor, .62); c.globalAlpha = .55; c.fillRect(x0 + off, y, 1.2, h); c.globalAlpha = 1
        }
      }
      c.fillStyle = shade(baseColor, .58); c.globalAlpha = .5; c.fillRect(0, y, S, 1.4); c.globalAlpha = 1
    }
  } else if (kind === 'tile') {
    const tile = 60 * cm, n = Math.round(S / tile), t = S / n, grout = 2.2
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const f = .95 + rand() * .08
      c.fillStyle = shade(baseColor, f); c.fillRect(i * t, j * t, t, t)
      for (let k = 0; k < 900; k++) { c.fillStyle = rand() > .5 ? '#ffffff' : '#000000'; c.globalAlpha = .025; c.fillRect(i * t + rand() * t, j * t + rand() * t, 2, 2) }
      c.globalAlpha = 1
      const grd = c.createLinearGradient(i * t, j * t, i * t + t, j * t + t); grd.addColorStop(0, 'rgba(255,255,255,.10)'); grd.addColorStop(1, 'rgba(0,0,0,.05)')
      c.fillStyle = grd; c.fillRect(i * t, j * t, t, t)
    }
    c.fillStyle = shade(baseColor, .72)
    for (let i = 0; i <= n; i++) { c.fillRect(i * t - grout / 2, 0, grout, S); c.fillRect(0, i * t - grout / 2, S, grout) }
  } else if (kind === 'marble') {
    for (let k = 0; k < 2500; k++) { c.fillStyle = rand() > .5 ? '#ffffff' : '#9a9c98'; c.globalAlpha = .035; const r = 6 + rand() * 20; c.beginPath(); c.arc(rand() * S, rand() * S, r, 0, 6.283); c.fill() }
    const vein = (width: number, alpha: number, color: string) => {
      let x = rand() * S, y = rand() * S, a = rand() * 6.283
      const pts: [number, number][] = []
      for (let s = 0; s < 70; s++) { a += (rand() - .5) * .55; x += Math.cos(a) * 9; y += Math.sin(a) * 9; pts.push([x, y]) }
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy))
        c.strokeStyle = color; c.globalAlpha = alpha; c.lineWidth = width; c.lineJoin = 'round'; c.stroke()
      }
    }
    for (let i = 0; i < 4; i++) { vein(5, .05, '#8d908c'); vein(1.4, .28, '#9b9e99') }
    for (let i = 0; i < 6; i++) vein(.7, .22, '#b7b9b4')
    c.globalAlpha = 1
    // large slabs with hairline joints
    c.fillStyle = 'rgba(150,150,145,.35)'; c.fillRect(0, 0, S, 1); c.fillRect(0, 0, 1, S)
  } else {
    for (let k = 0; k < 3000; k++) { c.fillStyle = rand() > .5 ? '#ffffff' : '#000000'; c.globalAlpha = .02; c.fillRect(rand() * S, rand() * S, 2, 2) }
    c.globalAlpha = 1
  }
  cache.set(key, cv)
  return cv
}
const urlCache = new Map<string, string>()
export function floorDataUrl(material: FloorMaterial, baseColor: string) {
  const key = `${material}|${baseColor}`
  let url = urlCache.get(key)
  if (!url) { url = floorCanvas(material, baseColor).toDataURL('image/jpeg', .86); urlCache.set(key, url) }
  return url
}

/** Soft woven fabric used for rugs (near-white, tinted by the rug color). */
let fabric: HTMLCanvasElement | null = null
export function fabricCanvas() {
  if (fabric) return fabric
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S
  const c = cv.getContext('2d')!, rand = rng(42)
  c.fillStyle = '#f4f4f4'; c.fillRect(0, 0, S, S)
  for (let y = 0; y < S; y += 2) { c.fillStyle = y % 4 ? '#ffffff' : '#e6e6e6'; c.globalAlpha = .55; c.fillRect(0, y, S, 1) }
  for (let x = 0; x < S; x += 2) { c.fillStyle = x % 4 ? '#ffffff' : '#e2e2e2'; c.globalAlpha = .35; c.fillRect(x, 0, 1, S) }
  for (let k = 0; k < 1500; k++) { c.fillStyle = rand() > .5 ? '#ffffff' : '#cfcfcf'; c.globalAlpha = .25; c.fillRect(rand() * S, rand() * S, 1, 1) }
  c.globalAlpha = 1
  fabric = cv
  return cv
}

/** Upholstery textures (near-white, tinted by the fabric colour). Flatweave is a
 *  fine, even basket weave; tweed is a nubby, flecked multi-tone yarn. */
const upholstery = new Map<string, HTMLCanvasElement>()
export function upholsteryCanvas(fabric: 'flatweave' | 'tweed' | 'boucle' | 'textured') {
  const hit = upholstery.get(fabric); if (hit) return hit
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S
  const c = cv.getContext('2d')!, rand = rng(fabric === 'tweed' ? 7 : 3)
  c.fillStyle = '#f2f2f2'; c.fillRect(0, 0, S, S)
  if (fabric === 'flatweave') {
    for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) {
      const on = ((x >> 1) + (y >> 1)) % 2 === 0
      c.fillStyle = on ? '#ffffff' : '#e3e3e3'; c.fillRect(x, y, 2, 2)
    }
    for (let k = 0; k < 700; k++) { c.fillStyle = rand() > .5 ? '#ffffff' : '#d8d8d8'; c.globalAlpha = .3; c.fillRect(rand() * S, rand() * S, 1, 1) }
  } else if (fabric === 'boucle') {
    // looped bouclé: many small soft rings
    for (let k = 0; k < 1700; k++) { const x = rand() * S, y = rand() * S, r = 1.2 + rand() * 1.8
      c.strokeStyle = rand() > .5 ? '#ffffff' : '#d2d2d2'; c.globalAlpha = .7; c.lineWidth = .9
      for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) { c.beginPath(); c.arc(x + ox, y + oy, r, 0, 6.283); c.stroke() } }
    for (let k = 0; k < 600; k++) { c.fillStyle = '#c6c6c6'; c.globalAlpha = .35; c.fillRect(rand() * S, rand() * S, 1.2, 1.2) }
  } else if (fabric === 'textured') {
    for (let y = 0; y < S; y += 3) { c.fillStyle = y % 6 ? '#ffffff' : '#dadada'; c.globalAlpha = .5; c.fillRect(0, y, S, 1.5) }
    for (let k = 0; k < 1600; k++) { c.fillStyle = rand() > .5 ? '#ffffff' : '#cfcfcf'; c.globalAlpha = .4; c.fillRect(rand() * S, rand() * S, 2 + rand() * 2, 1) }
  } else {
    for (let k = 0; k < 2600; k++) {
      const v = rand(); c.fillStyle = v > .7 ? '#ffffff' : v > .35 ? '#dcdcdc' : '#c4c4c4'
      c.globalAlpha = .55; const x = rand() * S, y = rand() * S, l = 1 + rand() * 3
      c.fillRect(x, y, l, 1.4); if (x + l > S) c.fillRect(x - S, y, l, 1.4)
    }
    for (let k = 0; k < 260; k++) { c.fillStyle = rand() > .5 ? '#9a9a9a' : '#ffffff'; c.globalAlpha = .45; c.beginPath(); c.arc(rand() * S, rand() * S, .8 + rand() * .9, 0, 6.283); c.fill() }
  }
  c.globalAlpha = 1
  upholstery.set(fabric, cv)
  return cv
}

/** Outdoor ground textures. One tile covers GROUND_CM × GROUND_CM. */
export const GROUND_CM = 200
const groundCache = new Map<string, HTMLCanvasElement>()
export function groundCanvas(kind: 'grass' | 'stone' | 'concrete' | 'decking' | 'tiles' | 'none', color: string) {
  const key = `${kind}|${color}`, hit = groundCache.get(key); if (hit) return hit
  const S = 256, cm = S / GROUND_CM, cv = document.createElement('canvas'); cv.width = cv.height = S
  const c = cv.getContext('2d')!, rand = rng(kind.length * 131 + 7)
  c.fillStyle = color; c.fillRect(0, 0, S, S)
  if (kind === 'grass') {
    // Soft tonal patches, then thousands of short blades in light and dark greens.
    for (let k = 0; k < 60; k++) { c.fillStyle = shade(color, .86 + rand() * .26); c.globalAlpha = .35; c.beginPath(); c.arc(rand() * S, rand() * S, 12 + rand() * 40, 0, 6.283); c.fill() }
    for (let k = 0; k < 5200; k++) {
      const x = rand() * S, y = rand() * S, l = 2 + rand() * 4, a = -Math.PI / 2 + (rand() - .5) * .9
      c.strokeStyle = shade(color, .7 + rand() * .55); c.globalAlpha = .55; c.lineWidth = .8
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke()
    }
  } else if (kind === 'decking') {
    const board = 14 * cm
    for (let y = 0; y < S; y += board) { c.fillStyle = shade(color, .88 + rand() * .2); c.fillRect(0, y, S, board - 1.5); c.fillStyle = shade(color, .55); c.fillRect(0, y + board - 1.5, S, 1.5)
      for (let g = 0; g < 6; g++) { c.strokeStyle = shade(color, .75); c.globalAlpha = .25; c.beginPath(); const gy = y + rand() * board; c.moveTo(0, gy); c.lineTo(S, gy + (rand() - .5) * 3); c.stroke() } c.globalAlpha = 1 }
  } else if (kind === 'tiles' || kind === 'stone') {
    const n = kind === 'tiles' ? 4 : 0
    if (n) { const t = S / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = shade(color, .9 + rand() * .16); c.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3) } c.fillStyle = shade(color, .7); for (let i = 0; i <= n; i++) { c.fillRect(i * t - 1.5, 0, 3, S); c.fillRect(0, i * t - 1.5, S, 3) } }
    else { // irregular flagstones
      c.fillStyle = shade(color, .62); c.fillRect(0, 0, S, S)
      for (let k = 0; k < 26; k++) { const x = rand() * S, y = rand() * S, r = 18 + rand() * 26; c.fillStyle = shade(color, .9 + rand() * .2)
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { c.beginPath(); for (let v = 0; v < 7; v++) { const a = v / 7 * 6.283 + rand() * .4, rr = r * (.75 + rand() * .3); const px = x + ox + Math.cos(a) * rr, py = y + oy + Math.sin(a) * rr; if (v) c.lineTo(px, py); else c.moveTo(px, py) } c.closePath(); c.fill() } }
    }
    for (let k = 0; k < 1800; k++) { c.fillStyle = rand() > .5 ? '#ffffff' : '#000000'; c.globalAlpha = .04; c.fillRect(rand() * S, rand() * S, 2, 2) }
  } else if (kind === 'concrete') {
    for (let k = 0; k < 4000; k++) { c.fillStyle = rand() > .5 ? '#ffffff' : '#000000'; c.globalAlpha = .05; c.fillRect(rand() * S, rand() * S, 1.5, 1.5) }
    c.globalAlpha = .35; c.fillStyle = shade(color, .7); c.fillRect(0, 0, S, 1.5); c.fillRect(0, 0, 1.5, S)
  }
  c.globalAlpha = 1
  groundCache.set(key, cv)
  return cv
}
const groundUrls = new Map<string, string>()
export function groundDataUrl(kind: Parameters<typeof groundCanvas>[0], color: string) {
  const key = `${kind}|${color}`; let u = groundUrls.get(key)
  if (!u) { u = groundCanvas(kind, color).toDataURL('image/jpeg', .85); groundUrls.set(key, u) }
  return u
}

/** Woven cane (rattan webbing): open octagonal mesh on a light backing. */
let cane: HTMLCanvasElement | null = null
export function caneCanvas() {
  if (cane) return cane
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S
  const c = cv.getContext('2d')!, cell = 16
  c.fillStyle = '#3b2f25'; c.fillRect(0, 0, S, S)
  c.lineCap = 'round'
  const strand = (x1: number, y1: number, x2: number, y2: number, w: number, col: string) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke() }
  for (let i = -S; i <= S * 2; i += cell) {
    strand(i, 0, i, S, 3.2, '#d9bd8b'); strand(0, i, S, i, 3.2, '#cfb27f')
    strand(i - S, 0, i, S, 2.4, '#e3c995'); strand(i + S, 0, i, S, 2.4, '#dcc08c')
  }
  cane = cv; return cv
}
/** Fine straight wood grain (near-white, tinted by the finish colour). */
let grain: HTMLCanvasElement | null = null
export function grainCanvas() {
  if (grain) return grain
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S
  const c = cv.getContext('2d')!, rand = rng(99)
  c.fillStyle = '#f2f2f2'; c.fillRect(0, 0, S, S)
  for (let g = 0; g < 70; g++) { const y = rand() * S, amp = .6 + rand() * 2, per = 1 + Math.floor(rand() * 3), ph = rand() * 6.283
    c.strokeStyle = rand() > .5 ? '#d9d9d9' : '#c9c9c9'; c.globalAlpha = .35 + rand() * .4; c.lineWidth = .5 + rand() * 1.3
    c.beginPath(); for (let x = 0; x <= S; x += 4) { const yy = y + Math.sin(x / S * per * 6.283 + ph) * amp; if (x) c.lineTo(x, yy); else c.moveTo(x, yy) } c.stroke() }
  c.globalAlpha = 1; grain = cv; return cv
}
