import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Raycaster, Vector2 } from 'three'
import type { PerspectiveCamera } from 'three'
import { slide } from './collide'
import {
  EYE_Y,
  WALK_SPEED,
  planBounds,
  roomAt,
  verticalFov,
  type RoomId,
  type WalkPose,
} from './plan'

export type MovePad = { x: number; z: number }

const raycaster = new Raycaster()
const pointer = new Vector2()

export function Walker({
  active,
  spawn,
  padRef,
  onSample,
}: {
  active: boolean
  spawn: { serial: number; pose: WalkPose }
  padRef: RefObject<MovePad>
  onSample: (pose: WalkPose & { room: RoomId }) => void
}) {
  const { camera, gl, scene, size } = useThree()
  const pose = useRef<WalkPose>(spawn.pose)
  const keys = useRef({ f: false, b: false, l: false, r: false })
  const look = useRef({ x: 0, y: 0, drag: false, moved: false, sx: 0, sy: 0 })
  const goal = useRef<{ x: number; z: number } | null>(null)
  const lastRoom = useRef<RoomId | null>(null)
  const serial = useRef(0)

  useEffect(() => {
    if (spawn.serial === serial.current) return
    serial.current = spawn.serial
    pose.current = { ...spawn.pose }
    goal.current = null
  }, [spawn])

  useEffect(() => {
    const down = (event: KeyboardEvent) => setKey(keys.current, event.code, true)
    const up = (event: KeyboardEvent) => setKey(keys.current, event.code, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    const el = gl.domElement
    const onDown = (event: PointerEvent) => {
      if (!active || event.button !== 0) return
      look.current = { x: event.clientX, y: event.clientY, drag: true, moved: false, sx: event.clientX, sy: event.clientY }
      el.setPointerCapture(event.pointerId)
    }
    const onMove = (event: PointerEvent) => {
      if (!look.current.drag) return
      const dx = event.clientX - look.current.x
      const dy = event.clientY - look.current.y
      look.current.x = event.clientX
      look.current.y = event.clientY
      if (Math.hypot(event.clientX - look.current.sx, event.clientY - look.current.sy) > 5) look.current.moved = true
      if (!active) return
      pose.current.yaw += dx * 0.004
      pose.current.pitch = Math.min(0.7, Math.max(-0.85, pose.current.pitch - dy * 0.003))
    }
    const onUp = (event: PointerEvent) => {
      if (!look.current.drag) return
      const wasDrag = look.current.moved
      look.current.drag = false
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
      if (!active || wasDrag) return
      const rect = el.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      const floor = hits.find((hit) => hit.object.userData.floor)
      if (!floor) return
      goal.current = { x: floor.point.x, z: floor.point.z }
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }
  }, [active, camera, gl, scene])

  useFrame((_, delta) => {
    const cam = camera as PerspectiveCamera
    if (!active) return
    const dt = Math.min(0.05, delta)
    const aspect = size.width / Math.max(1, size.height)
    const fov = verticalFov(aspect)
    if (Math.abs(cam.fov - fov) > 0.1) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
    cam.up.set(0, 1, 0)
    const current = pose.current
    const pad = padRef.current ?? { x: 0, z: 0 }
    let mx = (keys.current.r ? 1 : 0) - (keys.current.l ? 1 : 0) + pad.x
    let mz = (keys.current.f ? 1 : 0) - (keys.current.b ? 1 : 0) + pad.z
    if (Math.abs(mx) > 0.08 || Math.abs(mz) > 0.08) goal.current = null
    const sin = Math.sin(current.yaw)
    const cos = Math.cos(current.yaw)
    const forwardX = sin
    const forwardZ = -cos
    const rightX = cos
    const rightZ = sin
    let wx = forwardX * mz + rightX * mx
    let wz = forwardZ * mz + rightZ * mx
    if (goal.current) {
      const gx = goal.current.x - current.x
      const gz = goal.current.z - current.z
      const glen = Math.hypot(gx, gz)
      if (glen < 0.18) goal.current = null
      else {
        wx += gx / glen
        wz += gz / glen
      }
    }
    const input = Math.hypot(wx, wz)
    if (input > 1) {
      wx /= input
      wz /= input
    }
    const dx = wx * WALK_SPEED * dt
    const dz = wz * WALK_SPEED * dt
    const beforeX = current.x
    const beforeZ = current.z
    const next = slide(current.x, current.z, dx, dz)
    if (goal.current && Math.hypot(next.x - beforeX, next.z - beforeZ) < 0.002 && input > 0) {
      goal.current = null
    }
    current.x = next.x
    current.z = next.z
    cam.position.set(current.x, EYE_Y, current.z)
    cam.rotation.order = 'YXZ'
    cam.rotation.set(current.pitch, -current.yaw, 0)
    const room = roomAt(current.x, current.z)
    if (room && room !== lastRoom.current) {
      lastRoom.current = room
      onSample({ ...current, room })
    } else if (room) {
      onSample({ ...current, room })
    }
  })
  return null
}

export function PlanView({ active, onPick }: { active: boolean; onPick: (room: RoomId) => void }) {
  const { camera, gl, scene, size } = useThree()
  useEffect(() => {
    if (!active) return
    const cam = camera as PerspectiveCamera
    const bounds = planBounds()
    const cx = (bounds.minX + bounds.maxX) / 2
    const cz = (bounds.minZ + bounds.maxZ) / 2
    cam.up.set(0, 0, -1)
    cam.fov = 32
    cam.position.set(cx, 36, cz)
    cam.lookAt(cx, 0, cz)
    cam.updateProjectionMatrix()
    const el = gl.domElement
    const onUp = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      const floor = hits.find((hit) => hit.object.userData.floor)
      const room = floor ? roomAt(floor.point.x, floor.point.z) : null
      if (room) onPick(room)
    }
    el.addEventListener('pointerup', onUp)
    return () => el.removeEventListener('pointerup', onUp)
  }, [active, camera, gl, onPick, scene, size])
  return null
}

function setKey(keys: { f: boolean; b: boolean; l: boolean; r: boolean }, code: string, down: boolean): void {
  if (code === 'KeyW' || code === 'ArrowUp') keys.f = down
  else if (code === 'KeyS' || code === 'ArrowDown') keys.b = down
  else if (code === 'KeyA' || code === 'ArrowLeft') keys.l = down
  else if (code === 'KeyD' || code === 'ArrowRight') keys.r = down
}
