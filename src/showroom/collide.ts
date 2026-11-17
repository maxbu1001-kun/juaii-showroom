import { BODY_R, angleIn, b2Center, b2Cuts, b2Radius, barrierSegs, doorArcs } from './plan'
import type { Seg } from './plan'

const segs: Seg[] = barrierSegs()

function pushSeg(x: number, z: number, radius: number, s: Seg): { x: number; z: number } {
  const abx = s.bx - s.ax
  const abz = s.bz - s.az
  const len2 = abx * abx + abz * abz
  if (len2 < 1e-8) return { x, z }
  let t = ((x - s.ax) * abx + (z - s.az) * abz) / len2
  t = Math.min(1, Math.max(0, t))
  const cx = s.ax + abx * t
  const cz = s.az + abz * t
  const dx = x - cx
  const dz = z - cz
  const dist = Math.hypot(dx, dz)
  const side = dx * s.nx + dz * s.nz
  if (dist < 1e-6) {
    return { x: x + s.nx * radius, z: z + s.nz * radius }
  }
  if (side < 0) {
    if (dist > radius) return { x, z }
    return { x: cx + s.nx * radius, z: cz + s.nz * radius }
  }
  if (dist >= radius) return { x, z }
  const scale = radius / dist
  return { x: cx + dx * scale, z: cz + dz * scale }
}

function pushCircle(x: number, z: number, radius: number): { x: number; z: number } {
  const c = b2Center()
  const r = b2Radius()
  const dx = x - c.x
  const dz = z - c.z
  const dist = Math.hypot(dx, dz)
  if (dist > r + 0.55 || dist < 1e-5) return { x, z }
  const ang = Math.atan2(dx, dz)
  for (const cut of b2Cuts()) {
    if (angleIn(ang, cut.center, cut.half)) return { x, z }
  }
  if (dist <= r - radius) return { x, z }
  const scale = (r - radius) / dist
  return { x: c.x + dx * scale, z: c.z + dz * scale }
}

export function resolve(x: number, z: number, radius = BODY_R): { x: number; z: number } {
  let px = x
  let pz = z
  for (let pass = 0; pass < 3; pass += 1) {
    for (const barrier of segs) {
      const next = pushSeg(px, pz, radius, barrier)
      px = next.x
      pz = next.z
    }
    const circled = pushCircle(px, pz, radius)
    px = circled.x
    pz = circled.z
  }
  return { x: px, z: pz }
}

export function slide(x: number, z: number, dx: number, dz: number, radius = BODY_R): { x: number; z: number } {
  const dist = Math.hypot(dx, dz)
  const steps = Math.max(1, Math.ceil(dist / 0.08))
  let px = x
  let pz = z
  for (let i = 0; i < steps; i += 1) {
    const sx = dx / steps
    const sz = dz / steps
    const movedX = resolve(px + sx, pz, radius)
    const movedZ = resolve(movedX.x, movedX.z + sz, radius)
    px = movedZ.x
    pz = movedZ.z
  }
  return { x: px, z: pz }
}

export function doorCentersForTest(): { center: number; half: number }[] {
  return doorArcs(b2Radius())
}
