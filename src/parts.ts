/** Decorative desk accessories, laid out in the desk's local frame (cm, origin
 *  at the desk center, rear edge at -depth/2). Items that do not fit on the
 *  tabletop are omitted rather than allowed to overhang. Shared by 2D and 3D. */
export type DeskAccessories = {
  monitor?: { x: number; y: number; w: number }
  laptop?: { x: number; y: number; w: number; d: number }
  pad?: { x: number; y: number; w: number; d: number }
}
export function deskAccessories(width: number, depth: number): DeskAccessories {
  const m = 5, out: DeskAccessories = {}
  const half = { w: width / 2 - m, d: depth / 2 - m }
  if (width >= 45 && depth >= 30) {
    const w = Math.max(28, Math.min(62, width * .42))
    out.monitor = { x: width >= 110 ? -width * .06 : 0, y: -depth / 2 + m + 9, w }
  }
  const front = depth / 2 - m
  if (width >= 70 && depth >= 45) out.pad = { w: 24, d: 20, x: half.w - 12, y: front - 10 }
  const lw = 32, ld = 22
  if (width >= 95 && depth >= 55) {
    const x = Math.max(-half.w + lw / 2, Math.min((out.pad ? out.pad.x - 12 - 6 : half.w) - lw / 2, -width * .14))
    out.laptop = { w: lw, d: ld, x, y: front - ld / 2 }
  }
  return out
}

/** Front-elevation outline of a mirror, centred on (0,0), y up, as points (cm).
 *  Shared by the 3D glass/frame geometry and the library preview icons. */
export type MirrorKind = 'mirror-rect' | 'mirror-arch' | 'mirror-round' | 'mirror-oval' | 'mirror-wavy' | 'mirror-organic' | 'mirror-vanity' | 'mirror-floor'
export function mirrorOutline(kind: MirrorKind, w: number, h: number, rounded = false, n = 96): [number, number][] {
  const pts: [number, number][] = []
  const ellipse = (mod: (t: number) => number = () => 1, sq = 2) => {
    for (let i = 0; i < n; i++) {
      const t = i / n * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), r = mod(t)
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / sq), ey = Math.sign(s) * Math.pow(Math.abs(s), 2 / sq)
      pts.push([ex * r, ey * r])
    }
  }
  const roundRect = (r: number) => {
    const hw = w / 2, hh = h / 2, rr = Math.max(0, Math.min(r, hw, hh)), seg = 8
    const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= seg; i++) { const a = a0 + i / seg * Math.PI / 2; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]) } }
    corner(hw - rr, hh - rr, 0); corner(-hw + rr, hh - rr, Math.PI / 2); corner(-hw + rr, -hh + rr, Math.PI); corner(hw - rr, -hh + rr, Math.PI * 1.5)
    return pts
  }
  switch (kind) {
    case 'mirror-rect': case 'mirror-floor': return roundRect(Math.min(w, h) * .02)
    case 'mirror-vanity': return roundRect(rounded ? Math.min(w, h) * .18 : Math.min(w, h) * .02)
    case 'mirror-arch': {
      const r = w / 2, seg = 40
      pts.push([w / 2, -h / 2])
      for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI; pts.push([Math.cos(a) * r, h / 2 - r + Math.sin(a) * r]) }
      pts.push([-w / 2, -h / 2])
      return pts
    }
    case 'mirror-round': case 'mirror-oval': ellipse(); break
    case 'mirror-wavy': ellipse(t => 1 + .045 * Math.sin(t * 9), 4.2); break
    case 'mirror-organic': ellipse(t => 1 + .1 * Math.sin(2 * t + .6) + .06 * Math.sin(3 * t + 1.9) + .03 * Math.sin(5 * t + .3), 2.3); break
  }
  // normalise the curved shapes to exactly fill w × h
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  return pts.map(([x, y]) => [((x - x0) / (x1 - x0) - .5) * w, ((y - y0) / (y1 - y0) - .5) * h])
}

/** Door layout of an L-shaped corner wardrobe, in its local frame (cm; back =
 *  -y, left = -x, corner at the back-left). Shared by the 2D plan and 3D so
 *  both show the same doors, open shelving and mirror panel. */
export type LRun = { doors: { a: number; b: number; mirror?: boolean }[]; shelf?: { a: number; b: number } }
export function lWardrobeLayout(width: number, depth: number, arm: number, mirror: boolean): { back: LRun; side: LRun } {
  const split = (a: number, b: number, target = 50) => { const n = Math.max(1, Math.round((b - a) / target)); return Array.from({ length: n }, (_, i) => ({ a: a + (b - a) * i / n, b: a + (b - a) * (i + 1) / n })) }
  const bx0 = -width / 2 + arm, bx1 = width / 2
  let back: LRun
  if (mirror) {
    const len = bx1 - bx0
    let n = Math.max(1, Math.round(len / 50))
    if (n % 2 === 0) n = len / (n + 1) >= 38 ? n + 1 : Math.max(1, n - 1) // odd count, so one panel is central
    const doors = Array.from({ length: n }, (_, i) => ({ a: bx0 + len * i / n, b: bx0 + len * (i + 1) / n, mirror: i === Math.floor(n / 2) }))
    back = { doors }
  } else {
    const len = bx1 - bx0, s = len >= 110 ? Math.max(35, Math.min(50, Math.round(len * .24))) : 0
    back = { doors: split(bx0, bx1 - s), shelf: s ? { a: bx1 - s, b: bx1 } : undefined }
  }
  return { back, side: { doors: split(-depth / 2 + arm, depth / 2) } }
}
