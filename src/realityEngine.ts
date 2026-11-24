/**
 * Reality Mode rendering engine — loaded on demand (dynamic import) the first
 * time Reality Mode opens, so the normal 3D viewer never pays for it.
 *
 * It never changes geometry positions, sizes, rotations or colours. It only
 *  - swaps each mesh's material for a physically based clone of it (same
 *    colour and texture map) with tuned roughness / clearcoat / sheen and a
 *    procedurally derived relief (bump) map,
 *  - swaps sharp furniture boxes for identically sized boxes with a few
 *    millimetres of edge rounding,
 *  - adds image-based lighting (procedural room environment, no downloads),
 *  - renders through a post-processing chain: multisampled HDR render,
 *    ground-truth ambient occlusion (GTAO), then tone mapping.
 * Everything it creates is tracked and disposed in `dispose()`, which also
 * restores the original materials and geometries.
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { fabricCanvas, grainCanvas } from './textures'

export type Quality = 'high' | 'balanced'
export type Support = { ok: true; suggested: Quality; gpu: string } | { ok: false; reason: string }
export type Report = (done: number, label: string) => void // done: 0..1 of this session's share

/** Furniture kinds whose plain-coloured boxes are wood (grain relief + satin finish). */
const WOODY = new Set(['bed', 'wardrobe', 'desk', 'chair', 'dresser', 'bedside', 'shelf', 'shoe', 'tv-unit', 'halo-table', 'rattan-table', 'outdoor-table', 'garden-chair'])
const SOFT = new Set(['sofa', 'haven', 'lugo-chair', 'outdoor-sofa', 'lounger'])

export function checkSupport(gl: THREE.WebGLRenderer): Support {
  const ctx = gl.getContext()
  if (ctx.isContextLost()) return { ok: false, reason: 'The 3D graphics context was lost. Reload the page and try again.' }
  let gpu = ''
  try { const ext = ctx.getExtension('WEBGL_debug_renderer_info'); if (ext) gpu = String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) } catch { /* masked by the browser */ }
  const software = /swiftshader|llvmpipe|softpipe|basic render|software/i.test(gpu)
  const forced = (() => { try { return new URLSearchParams(location.search).has('reality-force') } catch { return false } })()
  if (software && !forced) return { ok: false, reason: 'Your browser is drawing 3D without a graphics processor (hardware acceleration is off or unavailable), so Reality Mode would be too slow.' }
  if (gl.capabilities.maxTextureSize < 4096 || gl.capabilities.maxSamples < 2) return { ok: false, reason: "This device's graphics processor doesn't support the high-quality rendering Reality Mode needs." }
  const pixels = window.screen.width * window.screen.height * window.devicePixelRatio ** 2
  const modest = /intel|uhd|iris|mali|adreno|powervr|videocore/i.test(gpu) || pixels > 9e6 || (navigator.hardwareConcurrency || 8) <= 4
  return { ok: true, suggested: modest || software ? 'balanced' : 'high', gpu }
}

/** Area lights need their lookup tables before any material compiles with them. */
let areaReady = false
export function initAreaLights() { if (!areaReady) { RectAreaLightUniformsLib.init(); areaReady = true } }

const settings = (q: Quality) => q === 'high'
  ? { dprBoost: 1.5, maxDpr: 2, samples: 8, aoSamples: 16, denoise: 16, round: .012, segments: 3, bumpPx: 1024 }
  : { dprBoost: 1, maxDpr: 1.5, samples: 4, aoSamples: 8, denoise: 8, round: .008, segments: 2, bumpPx: 512 }
export const pixelRatioFor = (q: Quality) => { const s = settings(q); return Math.min(s.maxDpr, Math.max(1, window.devicePixelRatio * s.dprBoost)) }

const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()))

/** Height map from a colour texture: luminance, contrast-stretched. Dark
 *  plank gaps, grain lines and weave valleys become recesses. */
function reliefFrom(src: CanvasImageSource & { width: number; height: number }, px: number) {
  const c = document.createElement('canvas'); c.width = c.height = px
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(src, 0, 0, px, px)
  const img = g.getImageData(0, 0, px, px), d = img.data
  let lo = 255, hi = 0
  for (let i = 0; i < d.length; i += 4) { const l = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; d[i] = l; if (l < lo) lo = l; if (l > hi) hi = l }
  const k = 255 / Math.max(8, hi - lo)
  for (let i = 0; i < d.length; i += 4) { const v = (d[i] - lo) * k; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255 }
  g.putImageData(img, 0, 0)
  return c
}
/** Fine plaster relief for painted walls (value noise, three octaves). */
function plasterCanvas(px: number) {
  const c = document.createElement('canvas'); c.width = c.height = px
  const g = c.getContext('2d')!, img = g.createImageData(px, px), d = img.data
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const grid = (n: number) => Array.from({ length: n * n }, rnd)
  const octs = [[8, .5], [32, .3], [128, .2]].map(([n, w]) => ({ n, w, v: grid(n) }))
  const smooth = (t: number) => t * t * (3 - 2 * t)
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    let v = 0
    for (const o of octs) {
      const fx = x / px * o.n, fy = y / px * o.n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0)
      const at = (i: number, j: number) => o.v[((j % o.n) * o.n) + (i % o.n)]
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx
      v += (a + (b - a) * ty) * o.w
    }
    const i = (y * px + x) * 4; d[i] = d[i + 1] = d[i + 2] = v * 255; d[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c
}

/** Hides see-through surfaces (glass, cut-away walls) from the AO depth pass
 *  so ambient occlusion is computed for the room behind them. */
class VisibilityPass extends Pass {
  private list: THREE.Object3D[]; private show: boolean
  constructor(list: THREE.Object3D[], show: boolean) { super(); this.list = list; this.show = show; this.needsSwap = false }
  render() { for (const o of this.list) o.visible = this.show }
}

type Saved = { mesh: THREE.Mesh; material: THREE.Material; geometry: THREE.BufferGeometry }
type Ctx = { surface?: string; floorKind?: string; furniture?: string }

export class RealitySession {
  private gl: THREE.WebGLRenderer; private scene: THREE.Scene; private camera: THREE.Camera; private quality: Quality
  private s: ReturnType<typeof settings>
  private saved: Saved[] = []
  private owned: { dispose: () => void }[] = []
  private reliefs = new Map<unknown, THREE.Texture>()
  private rounded = new Map<string, THREE.BufferGeometry>()
  private seeThrough: THREE.Object3D[] = []
  private mine = new Set<THREE.Material>()
  private composer: EffectComposer | null = null
  private gtao: GTAOPass | null = null
  private envRT: THREE.WebGLRenderTarget | null = null
  private prevEnv: THREE.Texture | null = null
  private prevEnvIntensity = 1
  private prevExposure = 1
  private plaster: THREE.Texture | null = null
  private generic: { grain?: THREE.Texture; weave?: THREE.Texture } = {}
  private sweepAt = 0

  constructor(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, quality: Quality) {
    this.gl = gl; this.scene = scene; this.camera = camera; this.quality = quality; this.s = settings(quality)
  }

  /** Runs the measurable preparation stages; `report(fraction, label)`. */
  async prepare(report: Report, cancelled: () => boolean) {
    const stop = () => { if (cancelled()) throw new DOMException('cancelled', 'AbortError') }
    // 1. Image-based lighting from a procedural room environment (weight .14)
    report(0, 'Lighting the room')
    await frame(); stop()
    const pmrem = new THREE.PMREMGenerator(this.gl)
    const env = new RoomEnvironment()
    this.envRT = pmrem.fromScene(env, .035)
    env.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.() })
    pmrem.dispose()
    this.prevEnv = this.scene.environment; this.prevEnvIntensity = this.scene.environmentIntensity
    this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = .48
    this.prevExposure = this.gl.toneMappingExposure; this.gl.toneMappingExposure = .96
    report(.14, 'Crafting textures')
    await frame(); stop()

    // 2. Relief maps: one per distinct texture image in the room, plus plaster,
    //    a generic wood grain and a generic weave (weight .26, per texture)
    const meshes: { mesh: THREE.Mesh; ctx: Ctx }[] = []
    const walk = (o: THREE.Object3D, ctx: Ctx) => {
      const u = o.userData as { surface?: string; floorKind?: string; furnitureKind?: string }
      const next = u.surface || u.furnitureKind ? { ...ctx, ...(u.surface ? { surface: u.surface, floorKind: u.floorKind } : {}), ...(u.furnitureKind ? { furniture: u.furnitureKind } : {}) } : ctx
      if ((o as THREE.Mesh).isMesh) meshes.push({ mesh: o as THREE.Mesh, ctx: next })
      for (const c of o.children) walk(c, next)
    }
    walk(this.scene, {})
    const images = new Set<unknown>()
    for (const { mesh } of meshes) { const mt = mesh.material as THREE.MeshStandardMaterial; if (!Array.isArray(mt) && mt?.map?.image) images.add(mt.map.image) }
    const jobs: (() => void)[] = [
      ...[...images].map(img => () => { const t = new THREE.CanvasTexture(reliefFrom(img as HTMLCanvasElement, Math.min(this.s.bumpPx, (img as HTMLCanvasElement).width || 512))); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; this.reliefs.set(img, t); this.owned.push(t) }),
      () => { const t = new THREE.CanvasTexture(plasterCanvas(this.s.bumpPx / 2)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); this.plaster = t; this.owned.push(t) },
      () => { const t = new THREE.CanvasTexture(reliefFrom(grainCanvas(), 512)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; this.generic.grain = t; this.owned.push(t) },
      () => { const t = new THREE.CanvasTexture(reliefFrom(fabricCanvas(), 512)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; this.generic.weave = t; this.owned.push(t) },
    ]
    for (let i = 0; i < jobs.length; i++) { jobs[i](); report(.14 + .26 * (i + 1) / jobs.length, `Crafting textures · ${i + 1} of ${jobs.length}`); await frame(); stop() }

    // 3. Materials and edges, mesh by mesh (weight .3)
    const chunk = 24
    for (let i = 0; i < meshes.length; i++) {
      this.upgrade(meshes[i].mesh, meshes[i].ctx)
      if ((i + 1) % chunk === 0 || i === meshes.length - 1) { report(.4 + .3 * (i + 1) / meshes.length, `Refining materials & edges · ${i + 1} of ${meshes.length}`); await frame(); stop() }
    }

    // 4. Post-processing chain (weight .08)
    report(.7, 'Setting up soft shadows & ambient occlusion')
    await frame(); stop()
    this.buildComposer()
    report(.78, 'Compiling shaders')
    await frame(); stop()

    // 5. Shader compilation — finishes as a whole; no partial progress exists (weight .17)
    await this.gl.compileAsync(this.scene, this.camera)
    stop()
    report(.95, 'Rendering first frames')

    // 6. Two warm-up frames through the full chain (weight .05)
    for (let i = 0; i < 2; i++) { this.render(); await frame(); stop() }
    report(1, 'Ready')
  }

  private relief(map: THREE.Texture | null | undefined, fallback?: THREE.Texture | null, repeat?: [number, number]) {
    const base = map?.image ? this.reliefs.get(map.image) : fallback
    if (!base) return null
    const t = base.clone() // shares the image; carries this map's own tiling
    if (map) { t.repeat.copy(map.repeat); t.offset.copy(map.offset); t.rotation = map.rotation; t.center.copy(map.center) }
    else if (repeat) t.repeat.set(repeat[0], repeat[1])
    t.needsUpdate = true; this.owned.push(t)
    return t
  }

  private upgrade(mesh: THREE.Mesh, ctx: Ctx) {
    if (mesh.userData.__reality) return
    const src = mesh.material as THREE.MeshStandardMaterial
    if (Array.isArray(src) || !src || !(src as THREE.MeshStandardMaterial).isMeshStandardMaterial) return
    mesh.userData.__reality = true
    if (src.envMap) return // mirrors keep their live cube-map reflection
    const p = (src as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial ? (src as THREE.MeshPhysicalMaterial).clone() : (() => {
      const m = new THREE.MeshPhysicalMaterial()
      THREE.MeshStandardMaterial.prototype.copy.call(m, src)
      ;(m as unknown as { defines: Record<string, string> }).defines = { STANDARD: '', PHYSICAL: '' }
      return m
    })()
    this.owned.push(p); this.mine.add(p)
    this.saved.push({ mesh, material: src, geometry: mesh.geometry })
    const geo = mesh.geometry as THREE.BoxGeometry
    const box = geo.type === 'BoxGeometry' ? geo.parameters : null
    const span = box ? Math.max(box.width, box.height, box.depth) : 1
    const lum = p.color.r * .3 + p.color.g * .59 + p.color.b * .11
    const see = p.transparent && p.opacity < .6
    const mapImg = src.map?.image as HTMLCanvasElement | undefined
    const mapW = mapImg?.width ?? 0
    const fabricMap = !!src.map && src.roughness >= .95
    const woodMap = !!src.map && !fabricMap && src.roughness <= .6

    if (ctx.surface === 'wall') {
      p.bumpMap = this.relief(null, this.plaster, [Math.max(1, span / .6), Math.max(1, span / .6)]); p.bumpScale = .15
      p.roughness = .93; p.envMapIntensity = .5
    } else if (see) {
      p.roughness = .02; p.metalness = 0; p.ior = 1.5; p.specularIntensity = 1; p.clearcoat = 1; p.clearcoatRoughness = .02; p.envMapIntensity = 1.35
    } else if (ctx.surface === 'floor') {
      const k = ctx.floorKind
      p.bumpMap = this.relief(src.map); p.bumpScale = k === 'wood' ? 1.6 : k === 'carpet' ? 2.4 : .7
      if (k === 'wood') { p.roughness = .5; p.clearcoat = .35; p.clearcoatRoughness = .32 }
      else if (k === 'marble') { p.roughness = .18; p.clearcoat = .85; p.clearcoatRoughness = .06 }
      else if (k === 'tile') { p.roughness = .32; p.clearcoat = .5; p.clearcoatRoughness = .14 }
      else if (k === 'carpet') { p.roughness = 1; p.sheen = .8; p.sheenRoughness = .8; p.sheenColor.copy(p.color).lerp(new THREE.Color('#fff'), .3) }
      p.envMapIntensity = .85
    } else if (ctx.surface === 'ceiling') {
      // matte painted ceiling: no mirror-like highlight of the window lights
      p.roughness = 1; p.specularIntensity = .08; p.envMapIntensity = .35
      p.bumpMap = this.relief(null, this.plaster, [6, 6]); p.bumpScale = .12
    } else if (ctx.surface === 'ground') {
      p.bumpMap = this.relief(src.map); p.bumpScale = 1.5; p.roughness = 1; p.envMapIntensity = .3
    } else if (p.metalness >= .5) {
      p.roughness = THREE.MathUtils.clamp(p.roughness * .85, .14, .45); p.envMapIntensity = 1.25
    } else if ((src.emissiveIntensity > 0 && src.emissive.getHex() !== 0) || (lum < .09 && src.roughness <= .35)) {
      // screens and dark glossy panels: black glass
      p.roughness = .07; p.clearcoat = 1; p.clearcoatRoughness = .03; p.envMapIntensity = 1.3
    } else if (fabricMap || (ctx.furniture && (SOFT.has(ctx.furniture) || src.roughness >= .9 || (ctx.furniture === 'bed' && lum > .62) || ctx.furniture === 'rug'))) {
      p.roughness = 1; p.sheen = .22; p.sheenRoughness = 1; p.sheenColor.copy(p.color).lerp(new THREE.Color('#ffffff'), .08)
      p.bumpMap = this.relief(src.map, this.generic.weave, [Math.max(1, span / .12), Math.max(1, span / .12)]); p.bumpScale = 1.2
      p.envMapIntensity = .25; p.specularIntensity = .2
    } else if (woodMap || (ctx.furniture && WOODY.has(ctx.furniture) && !src.map)) {
      p.roughness = THREE.MathUtils.clamp(src.roughness * .6, .36, .55); p.clearcoat = .28; p.clearcoatRoughness = .38
      p.bumpMap = this.relief(src.map, this.generic.grain, [Math.max(1, span / .9), Math.max(1, span / .9)]); p.bumpScale = .55
      // tall panels (wardrobe doors, cabinet sides) carry vertical grain
      if (!src.map && p.bumpMap && box && box.height > Math.max(box.width, box.depth)) { p.bumpMap.center.set(.5, .5); p.bumpMap.rotation = Math.PI / 2 }
      p.envMapIntensity = .8
    } else if (src.map) {
      p.bumpMap = this.relief(src.map); p.bumpScale = mapW > 256 ? 1.2 : .8; p.envMapIntensity = .7
    } else {
      p.roughness = ctx.furniture ? Math.min(src.roughness, .7) : src.roughness; p.clearcoat = ctx.furniture ? .12 : 0; p.clearcoatRoughness = .4; p.envMapIntensity = ctx.furniture ? .8 : .45
    }
    mesh.material = p

    // Soft furniture edges: the same outer size, a few millimetres of radius.
    if (box && ctx.furniture && !see) {
      const min = Math.min(box.width, box.height, box.depth)
      if (min >= .012) {
        const r = Math.min(this.s.round, min * .22)
        const key = `${box.width.toFixed(4)}|${box.height.toFixed(4)}|${box.depth.toFixed(4)}|${r.toFixed(4)}`
        let g = this.rounded.get(key)
        if (!g) { g = new RoundedBoxGeometry(box.width, box.height, box.depth, this.s.segments, r); this.rounded.set(key, g); this.owned.push(g) }
        mesh.geometry = g
      }
    }
  }

  private buildComposer() {
    const size = this.gl.getSize(new THREE.Vector2())
    const samples = Math.min(this.s.samples, this.gl.capabilities.maxSamples)
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples })
    const composer = new EffectComposer(this.gl, target)
    composer.setPixelRatio(this.gl.getPixelRatio())
    composer.setSize(size.x, size.y)
    composer.addPass(new RenderPass(this.scene, this.camera))
    composer.addPass(new VisibilityPass(this.seeThrough, false))
    const gtao = new GTAOPass(this.scene, this.camera, size.x * this.gl.getPixelRatio(), size.y * this.gl.getPixelRatio())
    gtao.updateGtaoMaterial({ radius: .32, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: this.s.aoSamples, distanceFallOff: 1, screenSpaceRadius: false })
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: this.quality === 'high' ? 6 : 4, rings: 2, samples: this.s.denoise })
    gtao.blendIntensity = .9
    composer.addPass(gtao)
    composer.addPass(new VisibilityPass(this.seeThrough, true))
    composer.addPass(new OutputPass())
    this.composer = composer; this.gtao = gtao
  }

  setSize(w: number, h: number) {
    if (!this.composer) return
    this.composer.setPixelRatio(this.gl.getPixelRatio())
    this.composer.setSize(w, h)
  }

  /** One frame through the full chain. Picks up meshes that appeared since
   *  preparation (e.g. a door re-mounted) about once a second. */
  render(dt = 0) {
    if (!this.composer) return
    this.sweepAt += dt
    if (this.sweepAt > 1) {
      this.sweepAt = 0
      const walk = (o: THREE.Object3D, ctx: Ctx) => {
        const u = o.userData as { surface?: string; floorKind?: string; furnitureKind?: string }
        const next = u.surface || u.furnitureKind ? { ...ctx, ...(u.surface ? { surface: u.surface, floorKind: u.floorKind } : {}), ...(u.furnitureKind ? { furniture: u.furnitureKind } : {}) } : ctx
        if ((o as THREE.Mesh).isMesh && !o.userData.__reality) this.upgrade(o as THREE.Mesh, next)
        for (const c of o.children) walk(c, next)
      }
      walk(this.scene, {})
    }
    // React keeps updating the original materials (cut-away wall opacity per
    // camera view, door hover glow); mirror those live props onto the clones.
    this.seeThrough.length = 0
    for (let i = this.saved.length - 1; i >= 0; i--) {
      const { mesh, material } = this.saved[i]
      const c = mesh.material as THREE.MeshPhysicalMaterial, o = material as THREE.MeshStandardMaterial
      // React replaced the material, or the mesh left the scene: forget it
      // (a replaced one is upgraded again by the next sweep).
      if (!this.mine.has(c) || !mesh.parent) { if (!this.mine.has(c)) delete mesh.userData.__reality; this.saved.splice(i, 1); continue }
      c.opacity = o.opacity; c.transparent = o.transparent; c.depthWrite = o.depthWrite
      if (o.emissive && c.emissive) { c.emissive.copy(o.emissive); c.emissiveIntensity = o.emissiveIntensity }
      if (c.transparent && c.opacity < .6 && mesh.visible) this.seeThrough.push(mesh)
    }
    this.composer.render(dt)
  }

  dispose() {
    for (const { mesh, material, geometry } of this.saved) {
      if (this.owned.includes(mesh.material as never)) mesh.material = material
      if (this.owned.includes(mesh.geometry as never)) mesh.geometry = geometry
      delete mesh.userData.__reality
    }
    this.scene.traverse(o => { delete o.userData.__reality })
    for (const o of this.seeThrough) o.visible = true
    this.saved = []; this.mine.clear()
    for (const r of this.owned) r.dispose()
    this.owned = []
    this.reliefs.clear(); this.rounded.clear()
    this.gtao?.dispose(); this.composer?.renderTarget1.dispose(); this.composer?.renderTarget2.dispose(); this.composer?.dispose()
    this.composer = null; this.gtao = null
    if (this.scene.environment === this.envRT?.texture) { this.scene.environment = this.prevEnv; this.scene.environmentIntensity = this.prevEnvIntensity }
    this.envRT?.dispose(); this.envRT = null
    this.gl.toneMappingExposure = this.prevExposure
  }
}
