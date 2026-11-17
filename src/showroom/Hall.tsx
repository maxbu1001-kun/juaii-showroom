import { useEffect, useMemo } from 'react'
import { CanvasTexture, DoubleSide, ExtrudeGeometry, LinearFilter, MeshStandardMaterial, SRGBColorSpace, Shape } from 'three'
import {
  RECTS,
  ROOM_H,
  WALL_T,
  b2Center,
  b2Radius,
  chordCuts,
  doorOnlyCuts,
  labels,
  shellBoxes,
  solidArcSpans,
} from './plan'
import type { RoomId } from './plan'

const DOOR_TOP = 2.2

export function Hall() {
  const wall = useMemo(
    () => new MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.93, metalness: 0, side: DoubleSide }),
    [],
  )
  const floorMat = useMemo(
    () => new MeshStandardMaterial({ color: '#d5cfc3', roughness: 1, metalness: 0 }),
    [],
  )
  const ceilMat = useMemo(
    () => new MeshStandardMaterial({ color: '#f3f1ec', roughness: 1, metalness: 0, side: DoubleSide }),
    [],
  )
  useEffect(
    () => () => {
      wall.dispose()
      floorMat.dispose()
      ceilMat.dispose()
    },
    [wall, floorMat, ceilMat],
  )
  const boxes = useMemo(() => shellBoxes(), [])
  const arcs = useMemo(() => solidArcSpans(), [])
  const chords = useMemo(() => chordCuts(), [])
  const lintels = useMemo(() => doorOnlyCuts(), [])
  const center = b2Center()
  const radius = b2Radius()
  return (
    <group>
      {RECTS.map((room) => (
        <mesh
          key={room.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[(room.minX + room.maxX) / 2, 0, (room.minZ + room.maxZ) / 2]}
          material={floorMat}
          userData={{ floor: true, room: room.id satisfies RoomId }}
        >
          <planeGeometry args={[room.maxX - room.minX, room.maxZ - room.minZ]} />
        </mesh>
      ))}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[center.x, 0.004, center.z]}
        material={floorMat}
        userData={{ floor: true, room: 'B2' satisfies RoomId }}
      >
        <circleGeometry args={[radius, 80]} />
      </mesh>
      {RECTS.map((room) => (
        <mesh
          key={`${room.id}-ceil`}
          rotation={[Math.PI / 2, 0, 0]}
          position={[(room.minX + room.maxX) / 2, ROOM_H, (room.minZ + room.maxZ) / 2]}
          material={ceilMat}
        >
          <planeGeometry args={[room.maxX - room.minX, room.maxZ - room.minZ]} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[center.x, ROOM_H, center.z]} material={ceilMat}>
        <circleGeometry args={[radius + 0.04, 80]} />
      </mesh>
      {boxes.map((box, index) => (
        <mesh key={index} position={[box.x, box.y, box.z]} material={wall}>
          <boxGeometry args={[box.sx, box.sy, box.sz]} />
        </mesh>
      ))}
      {arcs.map((span) => (
        <mesh key={`${span.a0}`} position={[center.x, ROOM_H / 2, center.z]} material={wall}>
          <cylinderGeometry
            args={[
              radius,
              radius,
              ROOM_H,
              Math.max(8, Math.ceil(((span.a1 - span.a0) / (Math.PI * 2)) * 96)),
              1,
              true,
              span.a0,
              Math.max(0.01, span.a1 - span.a0),
            ]}
          />
        </mesh>
      ))}
      {lintels.map((cut) => (
        <mesh key={`lintel-${cut.center}`} position={[center.x, (DOOR_TOP + ROOM_H) / 2, center.z]} material={wall}>
          <cylinderGeometry
            args={[
              radius,
              radius,
              ROOM_H - DOOR_TOP,
              Math.max(6, Math.ceil((cut.half / Math.PI) * 64)),
              1,
              true,
              cut.center - cut.half,
              cut.half * 2,
            ]}
          />
        </mesh>
      ))}
      {chords.map((cut) => (
        <ChordWall key={cut.center} centerAngle={cut.center} half={cut.half} material={wall} />
      ))}
      {labels().map((label) => (
        <DoorLabel key={`${label.text}-${label.x.toFixed(2)}-${label.z.toFixed(2)}-${label.rotY}`} {...label} />
      ))}
    </group>
  )
}

function ChordWall({
  centerAngle,
  half,
  material,
}: {
  centerAngle: number
  half: number
  material: MeshStandardMaterial
}) {
  const geometry = useMemo(() => {
    const radius = b2Radius()
    const a0 = centerAngle - half
    const a1 = centerAngle + half
    const shape = new Shape()
    const vx = (r: number, a: number) => r * Math.sin(a)
    const vy = (r: number, a: number) => -r * Math.cos(a)
    const outer = radius + WALL_T
    shape.moveTo(vx(outer, a0), vy(outer, a0))
    const steps = 10
    for (let i = 1; i <= steps; i += 1) {
      const a = a0 + ((a1 - a0) * i) / steps
      shape.lineTo(vx(outer, a), vy(outer, a))
    }
    shape.lineTo(vx(radius, a1), vy(radius, a1))
    shape.lineTo(vx(radius, a0), vy(radius, a0))
    shape.closePath()
    const geo = new ExtrudeGeometry(shape, { depth: ROOM_H, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2)
    const c = b2Center()
    geo.translate(c.x, 0, c.z)
    return geo
  }, [centerAngle, half])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={material} />
}

function DoorLabel({ text, x, y, z, rotY }: { text: string; x: number; y: number; z: number; rotY: number }) {
  const map = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 96
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.clearRect(0, 0, 256, 96)
    ctx.fillStyle = '#6a655f'
    ctx.font = '400 64px "IBM Plex Sans", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 128, 48)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.needsUpdate = true
    return texture
  }, [text])
  useEffect(() => () => map.dispose(), [map])
  return (
    <mesh position={[x, y, z]} rotation={[0, rotY, 0]}>
      <planeGeometry args={[0.34, 0.12]} />
      <meshBasicMaterial map={map} transparent toneMapped={false} />
    </mesh>
  )
}
