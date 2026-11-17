// Floor plan v2 — visual review passed. Two choices are still pending the
// owner's decision and are switches: b2DiameterM (7.2 default, 8 alternative)
// and screenRoom ('B1' default, 'B2' alternative). Do not treat other numbers
// here as a finished interior design.

import type { Sku } from '../copy'

export const b2DiameterM = 7.2
export const screenRoom: 'B1' | 'B2' = 'B1'

export const WALL_T = 0.22
export const ROOM_H = 2.62
export const DOOR_H = 2.2
export const DOOR_W = 1.2
export const WIDE_DOOR = 2.4
export const NICHE_D = 1.2
export const CHORD_W = 1.3
export const EYE_Y = 1.6
export const WALK_SPEED = 1.3
export const BODY_R = 0.3
export const HFOV_DEG = 65
export const NEAR_PLINTH = 2

export const exhibitStandingZ = 2.6

export type RoomId = 'A1' | 'B1' | 'C1' | 'A2' | 'B2' | 'C2' | 'A3' | 'B3' | 'C3'

export type WalkPose = { x: number; y: number; z: number; yaw: number; pitch: number }

export type RectRoom = {
  id: Exclude<RoomId, 'B2'>
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type BoxSpec = { x: number; y: number; z: number; sx: number; sy: number; sz: number }

export type Seg = { ax: number; az: number; bx: number; bz: number; nx: number; nz: number }

export type LabelSpec = { text: RoomId; x: number; y: number; z: number; rotY: number }

const COL_W = { A: 6.4, B: 7.2, C: 6.4 } as const
const ROW_D = { 1: 5.6, 2: 7.2, 3: 5.6 } as const

export function b2Radius(): number {
  return b2DiameterM / 2
}

export function b2Center(): { x: number; z: number } {
  return { x: COL_W.B / 2, z: -(WALL_T + b2Radius()) }
}

export function localToWorld(lx: number, lz: number): { x: number; z: number } {
  const c = b2Center()
  return { x: c.x + lx, z: c.z + lz }
}

function rect(col: 'A' | 'B' | 'C', row: 1 | 2 | 3): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const x0 = col === 'A' ? -(WALL_T + COL_W.A) : col === 'B' ? 0 : COL_W.B + WALL_T
  let z1 = 0
  if (row === 1) z1 = ROW_D[1]
  else if (row === 2) z1 = -WALL_T
  else z1 = -(WALL_T + ROW_D[2] + WALL_T)
  const depth = ROW_D[row]
  return { minX: x0, maxX: x0 + COL_W[col], minZ: z1 - depth, maxZ: z1 }
}

export const RECTS: readonly RectRoom[] = (
  [
    ['A', 1, 'A1'],
    ['B', 1, 'B1'],
    ['C', 1, 'C1'],
    ['A', 2, 'A2'],
    ['C', 2, 'C2'],
    ['A', 3, 'A3'],
    ['B', 3, 'B3'],
    ['C', 3, 'C3'],
  ] as const
).map(([col, row, id]) => ({ id, ...rect(col, row) }))

export function rectOf(id: Exclude<RoomId, 'B2'>): RectRoom {
  const found = RECTS.find((room) => room.id === id)
  if (!found) throw new Error(id)
  return found
}

export const NOTE_ROOMS: readonly RoomId[] = ['A1', 'C1', 'A2', 'C2', 'A3', 'B3', 'C3']

export function exhibitRoom(): 'B2' {
  return 'B2'
}

function chordAngles(radius: number): { center: number; half: number }[] {
  const half = Math.asin((CHORD_W / 2) / radius)
  return [
    { center: -Math.PI * 0.75, half },
    { center: Math.PI * 0.75, half },
  ]
}

export function doorArcs(radius: number): { center: number; half: number; width: number }[] {
  return [
    { center: 0, half: Math.asin(WIDE_DOOR / 2 / radius), width: WIDE_DOOR },
    { center: Math.PI / 2, half: Math.asin(DOOR_W / 2 / radius), width: DOOR_W },
    { center: Math.PI, half: Math.asin(DOOR_W / 2 / radius), width: DOOR_W },
    { center: -Math.PI / 2, half: Math.asin(DOOR_W / 2 / radius), width: DOOR_W },
  ]
}

export function normAngle(a: number): number {
  const t = Math.PI * 2
  let x = a % t
  if (x <= -Math.PI) x += t
  if (x > Math.PI) x -= t
  return x
}

export function angleIn(a: number, center: number, half: number): boolean {
  return Math.abs(normAngle(a - center)) <= half + 1e-5
}

export type Cut = { center: number; half: number }

export function chordCuts(): { center: number; half: number }[] {
  return chordAngles(b2Radius())
}

export function doorOnlyCuts(): { center: number; half: number; width: number }[] {
  return doorArcs(b2Radius())
}

export function b2Cuts(): Cut[] {
  const radius = b2Radius()
  return [...doorArcs(radius), ...chordAngles(radius)]
}

export function solidArcSpans(): { a0: number; a1: number }[] {
  const cuts = b2Cuts()
    .map((cut) => ({ a0: normAngle(cut.center - cut.half), a1: normAngle(cut.center + cut.half) }))
    .sort((p, q) => p.a0 - q.a0)
  const spans: { a0: number; a1: number }[] = []
  const flat: { a0: number; a1: number }[] = []
  for (const cut of cuts) {
    if (cut.a1 < cut.a0) {
      flat.push({ a0: cut.a0, a1: Math.PI })
      flat.push({ a0: -Math.PI, a1: cut.a1 })
    } else flat.push(cut)
  }
  flat.sort((p, q) => p.a0 - q.a0)
  let cursor = -Math.PI
  for (const cut of flat) {
    if (cut.a0 > cursor + 1e-4) spans.push({ a0: cursor, a1: cut.a0 })
    cursor = Math.max(cursor, cut.a1)
  }
  if (cursor < Math.PI - 1e-4) spans.push({ a0: cursor, a1: Math.PI })
  return spans
}

export type Mount = {
  x: number
  y: number
  z: number
  rotY: number
  sku?: Sku
}

function chordMount(index: 0 | 1): Mount {
  const radius = b2Radius()
  const cut = chordAngles(radius)[index]
  const mid = Math.sqrt(radius * radius - (CHORD_W / 2) ** 2)
  const ox = Math.sin(cut.center)
  const oz = Math.cos(cut.center)
  const world = localToWorld(ox * (mid - 0.012), oz * (mid - 0.012))
  return { x: world.x, y: 1.32, z: world.z, rotY: cut.center + Math.PI, sku: index === 0 ? 'J03-01' : 'J02-01' }
}

export function cardMounts(): Mount[] {
  return [chordMount(0), chordMount(1)]
}

export function plinths(): { sku: Sku; x: number; z: number }[] {
  return [
    { sku: 'J03-01', ...localToWorld(-1.13, -1.13) },
    { sku: 'J02-01', ...localToWorld(1.13, -1.13) },
  ]
}

export function guidePost(): { x: number; z: number } {
  return localToWorld(1.84, 1.84)
}

export function screenMount(): Mount {
  if (screenRoom === 'B1') {
    return { x: 0.01 + 0.025, y: 1.32, z: 1.1, rotY: Math.PI / 2 }
  }
  const world = localToWorld(2.35, 0.15)
  return { x: world.x, y: 1.32, z: world.z, rotY: Math.PI }
}

export function screenCamera(): { pos: [number, number, number]; target: [number, number, number] } {
  const mount = screenMount()
  const face = mount.rotY
  const dx = Math.sin(face)
  const dz = Math.cos(face)
  return {
    pos: [mount.x + dx * 2.15, 1.48, mount.z + dz * 2.15],
    target: [mount.x, mount.y, mount.z],
  }
}

export function closeupGoal(sku: Sku): { pos: [number, number, number]; target: [number, number, number] } {
  const plinth = plinths().find((item) => item.sku === sku)
  if (!plinth) throw new Error(sku)
  if (sku === 'J02-01') {
    return {
      pos: [plinth.x + 0.07, 0.55, plinth.z + 0.72],
      target: [plinth.x, 0.4, plinth.z - 0.03],
    }
  }
  return {
    pos: [plinth.x, 0.28, plinth.z + 0.46],
    target: [plinth.x, 0.18, plinth.z - 0.06],
  }
}

export function startPose(): WalkPose {
  return { x: COL_W.B / 2, y: EYE_Y, z: 4.6, yaw: 0, pitch: 0 }
}

export function standingPose(): WalkPose {
  const c = b2Center()
  return { x: c.x + 0, y: EYE_Y, z: c.z + exhibitStandingZ, yaw: 0, pitch: 0 }
}

export function shotPose(name: string | null): WalkPose | null {
  if (name === 'stand') return standingPose()
  if (name === 'b3') {
    const c = b2Center()
    return { x: c.x, y: EYE_Y, z: c.z - 2, yaw: 0, pitch: 0 }
  }
  if (name === 'a1') {
    const room = rectOf('A1')
    return {
      x: room.maxX - 0.9,
      y: EYE_Y,
      z: (room.minZ + room.maxZ) / 2,
      yaw: Math.PI / 2,
      pitch: 0,
    }
  }
  return null
}

export function entryPose(id: RoomId): WalkPose {
  if (id === 'B1') return startPose()
  if (id === 'B2') {
    const c = b2Center()
    return { x: c.x, y: EYE_Y, z: c.z + b2Radius() - 0.8, yaw: 0, pitch: 0 }
  }
  const room = rectOf(id)
  const cx = (room.minX + room.maxX) / 2
  const cz = (room.minZ + room.maxZ) / 2
  if (id === 'A1' || id === 'A2' || id === 'A3') {
    return { x: room.maxX - 0.8, y: EYE_Y, z: cz, yaw: -Math.PI / 2, pitch: 0 }
  }
  if (id === 'C1' || id === 'C2' || id === 'C3') {
    return { x: room.minX + 0.8, y: EYE_Y, z: cz, yaw: Math.PI / 2, pitch: 0 }
  }
  return { x: cx, y: EYE_Y, z: room.maxZ - 0.8, yaw: 0, pitch: 0 }
}

function pushBox(boxes: BoxSpec[], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
  if (x1 - x0 < 0.01 || y1 - y0 < 0.01 || z1 - z0 < 0.01) return
  boxes.push({
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    z: (z0 + z1) / 2,
    sx: x1 - x0,
    sy: y1 - y0,
    sz: z1 - z0,
  })
}

function wallX(
  boxes: BoxSpec[],
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  gap: [number, number] | null,
  doorHeight: number | null,
): void {
  const h = ROOM_H
  if (!gap) {
    pushBox(boxes, x0, x1, 0, h, z0, z1)
    return
  }
  pushBox(boxes, x0, x1, 0, h, z0, gap[0])
  pushBox(boxes, x0, x1, 0, h, gap[1], z1)
  if (doorHeight !== null) pushBox(boxes, x0, x1, doorHeight, h, gap[0], gap[1])
}

function wallZ(
  boxes: BoxSpec[],
  z0: number,
  z1: number,
  x0: number,
  x1: number,
  gap: [number, number] | null,
  doorHeight: number | null,
): void {
  const h = ROOM_H
  if (!gap) {
    pushBox(boxes, x0, x1, 0, h, z0, z1)
    return
  }
  pushBox(boxes, x0, gap[0], 0, h, z0, z1)
  pushBox(boxes, gap[1], x1, 0, h, z0, z1)
  if (doorHeight !== null) pushBox(boxes, gap[0], gap[1], doorHeight, h, z0, z1)
}

function gap(center: number, width: number): [number, number] {
  return [center - width / 2, center + width / 2]
}

export function shellBoxes(): BoxSpec[] {
  const boxes: BoxSpec[] = []
  const a = rectOf('A1')
  const b = rectOf('B1')
  const c = rectOf('C1')
  const a2 = rectOf('A2')
  const c2 = rectOf('C2')
  const a3 = rectOf('A3')
  const b3 = rectOf('B3')
  const c3 = rectOf('C3')
  const midA = (a.minZ + a.maxZ) / 2
  const midB = (b.minX + b.maxX) / 2
  const midRow3 = (b3.minZ + b3.maxZ) / 2
  const midA2 = (a2.minZ + a2.maxZ) / 2

  wallX(boxes, a.maxX, b.minX, a.minZ, a.maxZ, gap(midA, DOOR_W), DOOR_H)
  wallX(boxes, b.maxX, c.minX, b.minZ, b.maxZ, gap(midA, DOOR_W), DOOR_H)
  wallZ(boxes, a2.maxZ, a.minZ, a.minX, a.maxX, gap((a.minX + a.maxX) / 2, DOOR_W), DOOR_H)
  wallZ(boxes, b.minZ - WALL_T, b.minZ, b.minX, b.maxX, gap(midB, WIDE_DOOR), DOOR_H)
  wallZ(boxes, c2.maxZ, c.minZ, c.minX, c.maxX, gap((c.minX + c.maxX) / 2, DOOR_W), DOOR_H)
  wallZ(boxes, a3.maxZ, a2.minZ, a2.minX, a2.maxX, gap((a2.minX + a2.maxX) / 2, DOOR_W), DOOR_H)
  wallZ(boxes, b3.maxZ, b3.maxZ + WALL_T, b3.minX, b3.maxX, gap(midB, DOOR_W), DOOR_H)
  wallZ(boxes, c3.maxZ, c2.minZ, c2.minX, c2.maxX, gap((c2.minX + c2.maxX) / 2, DOOR_W), DOOR_H)
  wallX(boxes, a3.maxX, b3.minX, a3.minZ, a3.maxZ, gap(midRow3, DOOR_W), DOOR_H)
  wallX(boxes, b3.maxX, c3.minX, b3.minZ, b3.maxZ, gap(midRow3, DOOR_W), DOOR_H)
  wallX(boxes, a2.maxX, a2.maxX + WALL_T, a2.minZ, a2.maxZ, gap(midA2, DOOR_W), DOOR_H)
  wallX(boxes, c2.minX - WALL_T, c2.minX, c2.minZ, c2.maxZ, gap(midA2, DOOR_W), DOOR_H)

  wallX(boxes, a.minX - WALL_T, a.minX, a.minZ, a.maxZ, null, null)
  wallX(boxes, a2.minX - WALL_T, a2.minX, a2.minZ, a2.maxZ, null, null)
  wallX(boxes, a3.minX - WALL_T, a3.minX, a3.minZ, a3.maxZ, null, null)
  wallX(boxes, c.maxX, c.maxX + WALL_T, c.minZ, c.maxZ, null, null)
  wallX(boxes, c2.maxX, c2.maxX + WALL_T, c2.minZ, c2.maxZ, null, null)
  wallX(boxes, c3.maxX, c3.maxX + WALL_T, c3.minZ, c3.maxZ, null, null)
  wallZ(boxes, a3.minZ - WALL_T, a3.minZ, a3.minX, c3.maxX, null, null)
  wallZ(boxes, a.maxZ, a.maxZ + WALL_T, a.minX, a.maxX, null, null)
  wallZ(boxes, c.maxZ, c.maxZ + WALL_T, c.minX, c.maxX, null, null)

  const door = gap(midB, WIDE_DOOR)
  wallZ(boxes, b.maxZ, b.maxZ + WALL_T, b.minX, b.maxX, door, null)
  const nicheZ0 = b.maxZ + WALL_T
  const nicheZ1 = nicheZ0 + NICHE_D
  pushBox(boxes, door[0] - WALL_T, door[0], 0, ROOM_H, nicheZ0, nicheZ1)
  pushBox(boxes, door[1], door[1] + WALL_T, 0, ROOM_H, nicheZ0, nicheZ1)
  return boxes
}

function seg(ax: number, az: number, bx: number, bz: number, nx: number, nz: number): Seg {
  return { ax, az, bx, bz, nx, nz }
}

function split(a0: number, a1: number, gap0: number, gap1: number, z: number, nx: number, nz: number, xAxis: boolean): Seg[] {
  const out: Seg[] = []
  const push = (p: number, q: number) => {
    if (q - p < 0.04) return
    if (xAxis) out.push(seg(p, z, q, z, nx, nz))
    else out.push(seg(z, p, z, q, nx, nz))
  }
  push(a0, gap0)
  push(gap1, a1)
  return out
}

export function barrierSegs(): Seg[] {
  const segs: Seg[] = []
  const addX = (x: number, z0: number, z1: number, door: [number, number] | null, nx: number) => {
    if (!door) {
      segs.push(seg(x, z0, x, z1, nx, 0))
      return
    }
    segs.push(...split(z0, z1, door[0], door[1], x, nx, 0, false))
  }
  const addZ = (z: number, x0: number, x1: number, door: [number, number] | null, nz: number) => {
    if (!door) {
      segs.push(seg(x0, z, x1, z, 0, nz))
      return
    }
    segs.push(...split(x0, x1, door[0], door[1], z, 0, nz, true))
  }
  const a = rectOf('A1')
  const b = rectOf('B1')
  const c = rectOf('C1')
  const a2 = rectOf('A2')
  const c2 = rectOf('C2')
  const a3 = rectOf('A3')
  const b3 = rectOf('B3')
  const c3 = rectOf('C3')
  const row1 = gap((a.minZ + a.maxZ) / 2, DOOR_W)
  const row2 = gap((a2.minZ + a2.maxZ) / 2, DOOR_W)
  const row3 = gap((a3.minZ + a3.maxZ) / 2, DOOR_W)
  const colA = gap((a.minX + a.maxX) / 2, DOOR_W)
  const colBWide = gap((b.minX + b.maxX) / 2, WIDE_DOOR)
  const colB = gap((b.minX + b.maxX) / 2, DOOR_W)
  const colC = gap((c.minX + c.maxX) / 2, DOOR_W)

  addX(a.maxX, a.minZ, a.maxZ, row1, -1)
  addX(b.minX, b.minZ, b.maxZ, row1, 1)
  addX(b.maxX, b.minZ, b.maxZ, row1, -1)
  addX(c.minX, c.minZ, c.maxZ, row1, 1)
  addZ(a.minZ, a.minX, a.maxX, colA, 1)
  addZ(a2.maxZ, a2.minX, a2.maxX, colA, -1)
  addZ(b.minZ, b.minX, b.maxX, colBWide, 1)
  addZ(c.minZ, c.minX, c.maxX, colC, 1)
  addZ(c2.maxZ, c2.minX, c2.maxX, colC, -1)
  addZ(a2.minZ, a2.minX, a2.maxX, colA, 1)
  addZ(a3.maxZ, a3.minX, a3.maxX, colA, -1)
  addZ(b3.maxZ, b3.minX, b3.maxX, colB, -1)
  addZ(c2.minZ, c2.minX, c2.maxX, colC, 1)
  addZ(c3.maxZ, c3.minX, c3.maxX, colC, -1)
  addX(a2.maxX, a2.minZ, a2.maxZ, row2, -1)
  addX(c2.minX, c2.minZ, c2.maxZ, row2, 1)
  addX(a3.maxX, a3.minZ, a3.maxZ, row3, -1)
  addX(b3.minX, b3.minZ, b3.maxZ, row3, 1)
  addX(b3.maxX, b3.minZ, b3.maxZ, row3, -1)
  addX(c3.minX, c3.minZ, c3.maxZ, row3, 1)

  addX(a.minX, a.minZ, a.maxZ, null, 1)
  addX(a2.minX, a2.minZ, a2.maxZ, null, 1)
  addX(a3.minX, a3.minZ, a3.maxZ, null, 1)
  addX(c.maxX, c.minZ, c.maxZ, null, -1)
  addX(c2.maxX, c2.minZ, c2.maxZ, null, -1)
  addX(c3.maxX, c3.minZ, c3.maxZ, null, -1)
  addZ(a.maxZ, a.minX, a.maxX, null, -1)
  addZ(c.maxZ, c.minX, c.maxX, null, -1)
  addZ(b.maxZ, b.minX, b.maxX, null, -1)
  addZ(a3.minZ, a3.minX, c3.maxX, null, 1)

  const radius = b2Radius()
  const center = b2Center()
  for (const chord of chordAngles(radius)) {
    const a0 = chord.center - chord.half
    const a1 = chord.center + chord.half
    const ax = center.x + radius * Math.sin(a0)
    const az = center.z + radius * Math.cos(a0)
    const bx = center.x + radius * Math.sin(a1)
    const bz = center.z + radius * Math.cos(a1)
    const vx = bx - ax
    const vz = bz - az
    let nx = -vz
    let nz = vx
    const len = Math.hypot(nx, nz) || 1
    nx /= len
    nz /= len
    const midX = (ax + bx) / 2
    const midZ = (az + bz) / 2
    if (nx * (center.x - midX) + nz * (center.z - midZ) < 0) {
      nx *= -1
      nz *= -1
    }
    segs.push(seg(ax, az, bx, bz, nx, nz))
  }
  for (const plinth of plinths()) {
    const h = 0.23
    segs.push(seg(plinth.x - h, plinth.z - h, plinth.x + h, plinth.z - h, 0, -1))
    segs.push(seg(plinth.x + h, plinth.z - h, plinth.x + h, plinth.z + h, 1, 0))
    segs.push(seg(plinth.x + h, plinth.z + h, plinth.x - h, plinth.z + h, 0, 1))
    segs.push(seg(plinth.x - h, plinth.z + h, plinth.x - h, plinth.z - h, -1, 0))
  }
  const post = guidePost()
  const p = 0.04
  segs.push(seg(post.x - p, post.z - p, post.x + p, post.z - p, 0, -1))
  segs.push(seg(post.x + p, post.z - p, post.x + p, post.z + p, 1, 0))
  segs.push(seg(post.x + p, post.z + p, post.x - p, post.z + p, 0, 1))
  segs.push(seg(post.x - p, post.z + p, post.x - p, post.z - p, -1, 0))
  return segs
}

export function labels(): LabelSpec[] {
  const out: LabelSpec[] = []
  const place = (text: RoomId, x: number, z: number, rotY: number) => {
    out.push({ text, x, y: 1.48, z, rotY })
  }
  const a = rectOf('A1')
  const b = rectOf('B1')
  const c = rectOf('C1')
  const a2 = rectOf('A2')
  const c2 = rectOf('C2')
  const a3 = rectOf('A3')
  const b3 = rectOf('B3')
  const midZ = (a.minZ + a.maxZ) / 2
  const midX = (b.minX + b.maxX) / 2
  place('B1', a.maxX - 0.28, midZ + DOOR_W / 2 + 0.22, Math.PI / 2)
  place('A1', b.minX + 0.28, midZ + DOOR_W / 2 + 0.22, -Math.PI / 2)
  place('C1', b.maxX - 0.28, midZ + DOOR_W / 2 + 0.22, Math.PI / 2)
  place('B1', c.minX + 0.28, midZ + DOOR_W / 2 + 0.22, -Math.PI / 2)
  place('B2', midX + WIDE_DOOR / 2 + 0.28, b.minZ + 0.04, 0)
  place('B1', midX + WIDE_DOOR / 2 + 0.28, b.minZ - WALL_T - 0.04, Math.PI)
  place('A2', (a.minX + a.maxX) / 2 + DOOR_W / 2 + 0.22, a.minZ + 0.04, 0)
  place('A1', (a2.minX + a2.maxX) / 2 + DOOR_W / 2 + 0.22, a2.maxZ - 0.04, Math.PI)
  place('C2', (c.minX + c.maxX) / 2 + DOOR_W / 2 + 0.22, c.minZ + 0.04, 0)
  place('C1', (c2.minX + c2.maxX) / 2 + DOOR_W / 2 + 0.22, c2.maxZ - 0.04, Math.PI)
  place('A3', (a2.minX + a2.maxX) / 2 - DOOR_W / 2 - 0.22, a2.minZ + 0.04, 0)
  place('A2', (a3.minX + a3.maxX) / 2 - DOOR_W / 2 - 0.22, a3.maxZ - 0.04, Math.PI)
  place('B3', midX - DOOR_W / 2 - 0.22, b3.maxZ + WALL_T + 0.04, Math.PI)
  place('B2', midX - DOOR_W / 2 - 0.22, b3.maxZ - 0.04, 0)
  place('C3', (c2.minX + c2.maxX) / 2 - DOOR_W / 2 - 0.22, c2.minZ + 0.04, 0)
  place('C2', (rectOf('C3').minX + rectOf('C3').maxX) / 2 - DOOR_W / 2 - 0.22, rectOf('C3').maxZ - 0.04, 0)
  place('B2', a2.maxX - 0.04, (a2.minZ + a2.maxZ) / 2 + DOOR_W / 2 + 0.2, Math.PI / 2)
  place('A2', a2.maxX + WALL_T + 0.04, (a2.minZ + a2.maxZ) / 2 + DOOR_W / 2 + 0.2, -Math.PI / 2)
  place('C2', c2.minX + 0.04, (c2.minZ + c2.maxZ) / 2 + DOOR_W / 2 + 0.2, -Math.PI / 2)
  place('B2', c2.minX - WALL_T - 0.04, (c2.minZ + c2.maxZ) / 2 + DOOR_W / 2 + 0.2, Math.PI / 2)
  place('B3', a3.maxX - 0.28, midZ, 0)
  place('A3', b3.minX + 0.28, (b3.minZ + b3.maxZ) / 2 + DOOR_W / 2 + 0.2, -Math.PI / 2)
  place('C3', b3.maxX - 0.28, (b3.minZ + b3.maxZ) / 2 + DOOR_W / 2 + 0.2, Math.PI / 2)
  place('B3', c.minX, (b3.minZ + b3.maxZ) / 2 + DOOR_W / 2 + 0.2, -Math.PI / 2)
  return out
}

export function roomAt(x: number, z: number): RoomId | null {
  const c = b2Center()
  if (Math.hypot(x - c.x, z - c.z) <= b2Radius() + 0.03) return 'B2'
  for (const room of RECTS) {
    if (x >= room.minX && x <= room.maxX && z >= room.minZ && z <= room.maxZ) return room.id
  }
  return null
}

export function planBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const room of RECTS) {
    minX = Math.min(minX, room.minX)
    maxX = Math.max(maxX, room.maxX)
    minZ = Math.min(minZ, room.minZ)
    maxZ = Math.max(maxZ, room.maxZ)
  }
  maxZ += NICHE_D + WALL_T
  return { minX: minX - WALL_T, maxX: maxX + WALL_T, minZ: minZ - WALL_T, maxZ }
}

export function verticalFov(aspect: number): number {
  const half = ((HFOV_DEG / 2) * Math.PI) / 180
  return (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI
}
