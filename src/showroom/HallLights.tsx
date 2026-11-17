import { useLayoutEffect, useRef } from 'react'
import type { DirectionalLight, Object3D, PointLight } from 'three'
import { b2Center, b2Radius, plinths, rectOf, type RoomId } from './plan'

const RING = 12
const WALL_POINT = 0
const OBJECT_POINT = 3.2

export function HallLights({ room }: { room: RoomId }) {
  const dirs = useRef<(DirectionalLight | null)[]>([])
  const dirTargets = useRef<(Object3D | null)[]>([])
  const ring = useRef<(PointLight | null)[]>([])
  const keep = useRef<(PointLight | null)[]>([])
  const objects = useRef<(PointLight | null)[]>([])

  useLayoutEffect(() => {
    dirs.current.forEach((light, index) => {
      const target = dirTargets.current[index]
      if (light && target) light.target = target
    })
  }, [room])

  const here = room === 'B2' ? null : rectOf(room)
  const center = b2Center()
  const radius = b2Radius()
  const ringR = radius * 0.62
  const posts = plinths()

  return (
    <>
      <hemisphereLight args={['#f3f1ec', '#f3f1ec', 1.55]} />
      <ambientLight color="#f3f1ec" intensity={0.4} />
      {Array.from({ length: 4 }, (_, index) => {
        const placed = directionalPose(room, index)
        return (
          <group key={index}>
            <directionalLight
              ref={(node) => {
                dirs.current[index] = node
              }}
              color="#f3f2ef"
              intensity={placed.intensity}
              position={placed.pos}
            />
            <object3D
              ref={(node) => {
                dirTargets.current[index] = node
              }}
              position={placed.target}
            />
          </group>
        )
      })}
      {Array.from({ length: RING }, (_, index) => {
        const angle = (index / RING) * Math.PI * 2
        const inHall = room === 'B2'
        const pos = inHall
          ? [center.x + Math.sin(angle) * ringR, 1.85, center.z + Math.cos(angle) * ringR]
          : perimeterPoint(here ?? rectOf('B1'), index)
        return (
          <pointLight
            key={index}
            ref={(node) => {
              ring.current[index] = node
            }}
            color="#f3f2ef"
            intensity={WALL_POINT}
            distance={9}
            decay={2}
            position={pos as [number, number, number]}
          />
        )
      })}
      {neighborCenters(room).map((spot, index) => (
        <pointLight
          key={`keep-${index}`}
          ref={(node) => {
            keep.current[index] = node
          }}
          color="#f3f2ef"
          intensity={0}
          distance={16}
          decay={2}
          position={spot ?? [0, 1.8, 0]}
        />
      ))}
      {posts.map((post, index) => (
        <pointLight
          key={post.sku}
          ref={(node) => {
            objects.current[index] = node
          }}
          color="#f3f2ef"
          intensity={OBJECT_POINT}
          distance={2.4}
          decay={2}
          position={[post.x, 1.05, post.z]}
        />
      ))}
    </>
  )
}

function neighborCenters(room: RoomId): ([number, number, number] | null)[] {
  const spots: Record<string, [number, number, number]> = {}
  for (const id of ['A1', 'B1', 'C1', 'A2', 'C2', 'A3', 'B3', 'C3'] as const) {
    const box = rectOf(id)
    spots[id] = [(box.minX + box.maxX) / 2, 1.8, (box.minZ + box.maxZ) / 2]
  }
  const c = b2Center()
  spots.B2 = [c.x, 1.8, c.z]
  const next: Record<RoomId, RoomId[]> = {
    A1: ['B1', 'A2'],
    B1: ['A1', 'C1', 'B2'],
    C1: ['B1', 'C2'],
    A2: ['A1', 'A3', 'B2'],
    B2: ['B1', 'A2', 'C2', 'B3'],
    C2: ['C1', 'C3', 'B2'],
    A3: ['A2', 'B3'],
    B3: ['A3', 'C3', 'B2'],
    C3: ['C2', 'B3'],
  }
  const list = next[room]
  return [0, 1, 2, 3].map((index) => (list[index] ? spots[list[index]] : null))
}

function perimeterPoint(
  room: { minX: number; maxX: number; minZ: number; maxZ: number },
  index: number,
): [number, number, number] {
  const inset = 0.7
  const x0 = room.minX + inset
  const x1 = room.maxX - inset
  const z0 = room.minZ + inset
  const z1 = room.maxZ - inset
  const edge = index % 4
  const t = ((index - edge) / 4 + 0.5) / 3
  if (edge === 0) return [x0 + (x1 - x0) * t, 1.85, z1]
  if (edge === 1) return [x1, 1.85, z1 - (z1 - z0) * t]
  if (edge === 2) return [x1 - (x1 - x0) * t, 1.85, z0]
  return [x0, 1.85, z0 + (z1 - z0) * t]
}

function directionalPose(room: RoomId, index: number): {
  pos: [number, number, number]
  target: [number, number, number]
  intensity: number
} {
  if (room === 'B2') {
    const c = b2Center()
    const angle = (index / 4) * Math.PI * 2
    const r = b2Radius() * 0.45
    return {
      pos: [c.x + Math.sin(angle) * r, 2.35, c.z + Math.cos(angle) * r],
      target: [c.x + Math.sin(angle) * b2Radius(), 1.3, c.z + Math.cos(angle) * b2Radius()],
      intensity: 0,
    }
  }
  const box = rectOf(room)
  const cx = (box.minX + box.maxX) / 2
  const cz = (box.minZ + box.maxZ) / 2
  const poses: { pos: [number, number, number]; target: [number, number, number] }[] = [
    { pos: [cx, 2.4, box.maxZ - 0.4], target: [cx, 1.3, box.minZ] },
    { pos: [cx, 2.4, box.minZ + 0.4], target: [cx, 1.3, box.maxZ] },
    { pos: [box.minX + 0.4, 2.4, cz], target: [box.maxX, 1.3, cz] },
    { pos: [box.maxX - 0.4, 2.4, cz], target: [box.minX, 1.3, cz] },
  ]
  return { ...poses[index], intensity: 0 }
}
