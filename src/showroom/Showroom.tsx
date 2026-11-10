import { CameraControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import CameraControlsImpl from 'camera-controls'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DoubleSide, MeshStandardMaterial, NeutralToneMapping, Vector3 } from 'three'
import type { Group, WebGLRenderer } from 'three'
import { PARTS } from '../copy'
import type { Lang, Pair, PartId, Sku, Zone } from '../copy'
import {
  getBrushedMap,
  makeFactPanel,
  makeMicroLabel,
  makeScreenPanel,
  makeSizeNote,
  noteLines,
} from './panels'
import type { PanelImage } from './panels'

export type ShowroomProps = {
  zone: Zone
  sku: Sku | null
  lang: Lang
  part: PartId | null
  sizeMarks: boolean
  clampNotes: boolean
  pose: 0 | 1 | 2
  rimOrbit: boolean
  screen: 'welcome' | 'close' | Sku
  frameNonce: number
  onReady: () => void
  onOpenSku: (sku: Sku) => void
  onGuide: () => void
  onPickPart: (part: PartId) => void
  onRimOrbitDone: () => void
}

const J03 = { x: 1.75, z: 2.4 }
const J02 = { x: 4.35, z: 2.4 }
const GUIDE = { x: 3.05, z: 3.55 }
const POSE_X = [-0.36, -0.74, -1.12] as const

type Goal = { pos: [number, number, number]; target: [number, number, number] }

const _lerpP = new Vector3()
const _lerpT = new Vector3()
const _sep = new Vector3()
const _goalSep = new Vector3()

const BACK_WALL = { min: [-0.7, 0, -0.1] as const, max: [7, 3.25, 0.02] as const }
const SIDE_WALL = { min: [-0.1, 0, -0.6] as const, max: [0.02, 3.25, 6.3] as const }

function segmentHitsBox(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): boolean {
  const origin = [ax, ay, az]
  const delta = [bx - ax, by - ay, bz - az]
  let t0 = 0
  let t1 = 1
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(delta[axis]) < 1e-8) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return false
      continue
    }
    let near = (min[axis] - origin[axis]) / delta[axis]
    let far = (max[axis] - origin[axis]) / delta[axis]
    if (near > far) {
      const swap = near
      near = far
      far = swap
    }
    t0 = Math.max(t0, near)
    t1 = Math.min(t1, far)
    if (t0 > t1) return false
  }
  return true
}

function crossesRoomWall(from: Vector3, to: Vector3): boolean {
  return (
    segmentHitsBox(from.x, from.y, from.z, to.x, to.y, to.z, BACK_WALL.min, BACK_WALL.max) ||
    segmentHitsBox(from.x, from.y, from.z, to.x, to.y, to.z, SIDE_WALL.min, SIDE_WALL.max)
  )
}

function cameraGoal(zone: Zone, sku: Sku | null): Goal {
  if (zone === 'closeup') {
    if (sku === 'J02-01') {
      return { pos: [5.02, 0.96, 3.02], target: [4.35, 0.6, 2.34] }
    }
    return { pos: [1.75, 0.98, 2.72], target: [1.75, 0.42, 2.4] }
  }
  switch (zone) {
    case 'j03':
      return { pos: [1.95, 1.2, 3.28], target: [1.75, 0.46, 2.4] }
    case 'j02':
      return { pos: [5.15, 1.16, 3.48], target: [4.35, 0.66, 2.4] }
    case 'wall':
      // Holds both fact cards even after the detail sheet narrows the view.
      return { pos: [3.05, 1.92, 6.05], target: [3.05, 1.42, 0.02] }
    case 'guide':
      return { pos: [3.05, 1.28, 4.7], target: [GUIDE.x, 0.72, GUIDE.z] }
    case 'screen':
      return { pos: [3.62, 1.7, 3.55], target: [0.08, 1.38, 3.55] }
    default:
      return { pos: [6.15, 2.28, 6.35], target: [2.35, 1.12, 2.15] }
  }
}

function useFontEpoch(): number {
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    let live = true
    void document.fonts.ready.then(() => {
      if (live) setEpoch(1)
    })
    return () => {
      live = false
    }
  }, [])
  return epoch
}

function usePanel(image: PanelImage): PanelImage {
  useEffect(() => () => image.texture.dispose(), [image])
  return image
}

type Flight = {
  fromP: Vector3
  fromT: Vector3
  toP: Vector3
  toT: Vector3
  lift: number
  t: number
}

function CameraRig({ cameraKey, onReady }: { cameraKey: string; onReady: () => void }) {
  const ref = useRef<CameraControlsImpl>(null)
  const readyOnce = useRef(false)
  const seen = useRef<string | null>(null)
  const flight = useRef<Flight | null>(null)

  useEffect(() => {
    const controls = ref.current
    if (!controls) return
    const cancelFlight = () => {
      flight.current = null
    }
    controls.addEventListener('controlstart', cancelFlight)
    return () => controls.removeEventListener('controlstart', cancelFlight)
  }, [])

  useEffect(() => {
    const controls = ref.current
    if (!controls) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Wall and screen frames sit just under the horizon. The old cap
    // (π/2 − 0.045) made those poses illegal, so the next orbit yanked them.
    controls.minPolarAngle = 0.28
    controls.maxPolarAngle = Math.PI / 2 - 0.008
    controls.minDistance = 0.18
    controls.maxDistance = 9
    controls.smoothTime = reduce ? 0 : 0.45
    controls.draggingSmoothTime = 0.1
    controls.dollySpeed = 0.38
    controls.azimuthRotateSpeed = 0.72
    controls.polarRotateSpeed = 0.52
    controls.infinityDolly = false
    const action = CameraControlsImpl.ACTION
    controls.mouseButtons.left = action.ROTATE
    controls.mouseButtons.right = action.DOLLY
    controls.mouseButtons.middle = action.NONE
    controls.mouseButtons.wheel = action.DOLLY
    controls.touches.one = action.TOUCH_ROTATE
    controls.touches.two = action.TOUCH_DOLLY
    controls.touches.three = action.NONE
    const [zone, sku] = cameraKey.split(':')
    const goal = cameraGoal(zone as Zone, sku === 'J03-01' || sku === 'J02-01' ? sku : null)
    const first = seen.current === null
    seen.current = cameraKey
    controls.normalizeRotations()
    void controls.setFocalOffset(0, 0, 0, false)
    const toP = new Vector3(goal.pos[0], goal.pos[1], goal.pos[2])
    const toT = new Vector3(goal.target[0], goal.target[1], goal.target[2])
    if (first || reduce) {
      flight.current = null
      void controls.setLookAt(toP.x, toP.y, toP.z, toT.x, toT.y, toT.z, false)
    } else {
      const fromP = new Vector3()
      const fromT = new Vector3()
      controls.getPosition(fromP, false)
      controls.getTarget(fromT, false)
      flight.current = {
        fromP,
        fromT,
        toP,
        toT,
        lift: crossesRoomWall(fromP, toP) ? 1.7 : 0,
        t: 0,
      }
    }
    if (!readyOnce.current) {
      readyOnce.current = true
      requestAnimationFrame(() => onReady())
    }
  }, [cameraKey, onReady])

  useFrame((_, delta) => {
    const controls = ref.current
    const fly = flight.current
    if (!controls || !fly) return
    fly.t = Math.min(1, fly.t + delta / 0.58)
    const k = fly.t >= 1 ? 1 : 1 - (1 - fly.t) ** 3
    _lerpP.copy(fly.fromP).lerp(fly.toP, k)
    _lerpT.copy(fly.fromT).lerp(fly.toT, k)
    if (fly.lift > 0 && k > 0 && k < 1) {
      _lerpP.y += Math.sin(Math.PI * k) * fly.lift
    }
    _sep.subVectors(_lerpP, _lerpT)
    if (_sep.length() < 0.42) {
      _goalSep.subVectors(fly.toP, fly.toT)
      if (_goalSep.lengthSq() > 1e-6) {
        _sep.lerp(_goalSep.normalize(), 0.7)
      }
      if (_sep.lengthSq() < 1e-6) _sep.set(0, 0.2, 1)
      _lerpP.copy(_lerpT).addScaledVector(_sep.normalize(), 0.42)
    }
    void controls.setLookAt(_lerpP.x, _lerpP.y, _lerpP.z, _lerpT.x, _lerpT.y, _lerpT.z, false)
    if (fly.t >= 1) {
      void controls.setLookAt(fly.toP.x, fly.toP.y, fly.toP.z, fly.toT.x, fly.toT.y, fly.toT.z, false)
      flight.current = null
    }
  })

  return <CameraControls ref={ref} makeDefault dollyToCursor={false} />
}

function pickHandlers(onActivate: () => void) {
  return {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation()
      onActivate()
    },
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => {
      document.body.style.cursor = ''
    },
  }
}

function OutlineHotspot({
  radius,
  selected,
  onActivate,
  label,
  lang,
  epoch,
  labelOffset = [0, 1],
  hit = 0,
}: {
  radius: number
  selected: boolean
  onActivate: () => void
  label?: Pair
  lang: Lang
  epoch: number
  labelOffset?: [number, number]
  hit?: number
}) {
  const group = useRef<Group>(null)
  useFrame(({ camera }) => {
    group.current?.lookAt(camera.position)
  })
  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
    }
  }, [])
  const tube = selected ? 0.0046 : 0.0016
  const hitRadius = hit > 0 ? hit : Math.max(0.04, radius * 2.4)
  return (
    <group ref={group}>
      <mesh>
        <torusGeometry args={[radius, tube, 8, 40]} />
        <meshBasicMaterial color={selected ? '#5e5a55' : '#6a655f'} />
      </mesh>
      <mesh {...pickHandlers(onActivate)}>
        <sphereGeometry args={[hitRadius, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {label ? (
        <PartLabel
          label={label}
          lang={lang}
          epoch={epoch}
          radius={radius}
          offset={labelOffset}
        />
      ) : null}
    </group>
  )
}

function PartLabel({
  label,
  lang,
  epoch,
  radius,
  offset,
}: {
  label: Pair
  lang: Lang
  epoch: number
  radius: number
  offset: [number, number]
}) {
  const image = usePanel(
    useMemo(() => {
      void epoch
      return makeMicroLabel(label, lang)
    }, [label, lang, epoch]),
  )
  const glyphs = Math.max(Array.from(label.zh).length, label.en.length)
  const w = Math.min(0.125, 0.009 * glyphs + 0.055)
  const h = Math.min(0.055, w / image.aspect)
  const len = Math.hypot(offset[0], offset[1]) || 1
  const ux = offset[0] / len
  const uy = offset[1] / len
  const dist = radius + 0.045 + h * 0.65
  return (
    <mesh position={[ux * dist, uy * dist, 0.02]} renderOrder={3}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={image.texture} toneMapped={false} depthTest={false} transparent />
    </mesh>
  )
}

function SizeMarks({ lang, epoch }: { lang: Lang; epoch: number }) {
  const image = usePanel(
    useMemo(() => {
      void epoch
      const lines = noteLines('size_weight', 'J03-01', lang)
      return makeSizeNote(lines.zh, lines.en)
    }, [lang, epoch]),
  )
  const board = useRef<Group>(null)
  useFrame(({ camera }) => {
    board.current?.lookAt(camera.position)
  })
  const w = 0.3
  const h = Math.min(0.16, w / image.aspect)
  const ink = '#2f2d2b'
  return (
    <group>
      <mesh position={[0, 0.03, 0.072]}>
        <boxGeometry args={[0.125, 0.0045, 0.0045]} />
        <meshBasicMaterial color={ink} />
      </mesh>
      <mesh position={[-0.0625, 0.03, 0.072]}>
        <boxGeometry args={[0.0045, 0.018, 0.0045]} />
        <meshBasicMaterial color={ink} />
      </mesh>
      <mesh position={[0.0625, 0.03, 0.072]}>
        <boxGeometry args={[0.0045, 0.018, 0.0045]} />
        <meshBasicMaterial color={ink} />
      </mesh>
      <mesh position={[0.074, 0.013, 0.02]}>
        <boxGeometry args={[0.0045, 0.026, 0.0045]} />
        <meshBasicMaterial color={ink} />
      </mesh>
      <mesh position={[0.074, 0.026, 0.02]}>
        <boxGeometry args={[0.016, 0.0045, 0.0045]} />
        <meshBasicMaterial color={ink} />
      </mesh>
      <mesh position={[0.074, 0, 0.02]}>
        <boxGeometry args={[0.016, 0.0045, 0.0045]} />
        <meshBasicMaterial color={ink} />
      </mesh>
      <group ref={board} position={[0.01, 0.155, -0.02]}>
        <mesh renderOrder={3}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={image.texture} toneMapped={false} depthTest={false} transparent />
        </mesh>
      </group>
    </group>
  )
}

function Tray({
  selected,
  closeup,
  lang,
  epoch,
  part,
  sizeMarks,
  rimOrbit,
  onOpen,
  onPickPart,
  onRimOrbitDone,
}: {
  selected: boolean
  closeup: boolean
  lang: Lang
  epoch: number
  part: PartId | null
  sizeMarks: boolean
  rimOrbit: boolean
  onOpen: () => void
  onPickPart: (part: PartId) => void
  onRimOrbitDone: () => void
}) {
  const map = useMemo(() => getBrushedMap(), [])
  const trayMat = useMemo(
    () =>
      new MeshStandardMaterial({
        map,
        color: '#d5d9dd',
        metalness: 0.16,
        roughness: 0.48,
        side: DoubleSide,
      }),
    [map],
  )
  useEffect(() => () => trayMat.dispose(), [trayMat])
  const spin = useRef<Group>(null)
  const spinning = useRef(false)
  const turned = useRef(0)
  const doneRef = useRef(onRimOrbitDone)
  useEffect(() => {
    doneRef.current = onRimOrbitDone
  }, [onRimOrbitDone])

  useEffect(() => {
    if (rimOrbit) {
      turned.current = 0
      spinning.current = true
      if (spin.current) spin.current.rotation.y = 0
    } else {
      spinning.current = false
    }
  }, [rimOrbit])

  useFrame((_, delta) => {
    if (!spinning.current || !spin.current) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    turned.current += reduce ? Math.PI * 2 : delta * 0.72
    if (turned.current >= Math.PI * 2) {
      spin.current.rotation.y = 0
      spinning.current = false
      turned.current = 0
      doneRef.current()
      return
    }
    spin.current.rotation.y = turned.current
  })

  const parts = [
    { id: 'j03-rim' as const, at: [0.078, 0.034, 0] as const, radius: 0.012, hit: 0.036, offset: [1, 0.2] as [number, number] },
    { id: 'j03-size' as const, at: [0.055, 0.02, 0.055] as const, radius: 0.012, hit: 0.034, offset: [1, -0.55] as [number, number] },
    { id: 'j03-brushed' as const, at: [-0.072, 0.032, -0.01] as const, radius: 0.012, hit: 0.036, offset: [-1, 0.25] as [number, number] },
    { id: 'j03-use' as const, at: [-0.012, 0.046, -0.062] as const, radius: 0.012, hit: 0.032, offset: [-0.2, 1] as [number, number] },
  ]

  return (
    <group>
      <group ref={spin}>
        <group
          onClick={(event) => {
            if (closeup) return
            event.stopPropagation()
            onOpen()
          }}
        >
          <mesh
            position={[0, 0.013, 0]}
            material={trayMat}
            castShadow
            {...(closeup ? pickHandlers(() => onPickPart('j03-brushed')) : {})}
          >
            <cylinderGeometry args={[0.0625, 0.0625, 0.026, 48, 1, true]} />
          </mesh>
          <mesh
            position={[0, 0.026, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={trayMat}
            {...(closeup ? pickHandlers(() => onPickPart('j03-rim')) : {})}
          >
            <ringGeometry args={[0.052, 0.0625, 48]} />
          </mesh>
          <mesh
            position={[0, 0.002, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={trayMat}
            {...(closeup ? pickHandlers(() => onPickPart('j03-use')) : {})}
          >
            <circleGeometry args={[0.052, 48]} />
          </mesh>
        </group>
      </group>
      {sizeMarks ? <SizeMarks lang={lang} epoch={epoch} /> : null}
      {closeup
        ? parts.map((item) => {
            return (
              <group key={item.id} position={item.at}>
                <OutlineHotspot
                  radius={item.radius}
                  hit={item.hit}
                  selected={part === item.id || (item.id === 'j03-size' && sizeMarks)}
                  onActivate={() => onPickPart(item.id)}
                  label={PARTS[item.id].label}
                  lang={lang}
                  epoch={epoch}
                  labelOffset={item.offset}
                />
              </group>
            )
          })
        : (
          <group position={[0, 0.05, 0]}>
            <OutlineHotspot
              radius={0.032}
              selected={selected}
              onActivate={onOpen}
              lang={lang}
              epoch={epoch}
            />
          </group>
        )}
    </group>
  )
}

function EdgeRect({ w, h }: { w: number; h: number }) {
  return <RectOutline w={w} h={h} thickness={0.0016} color="#6a655f" />
}

function RectOutline({
  w,
  h,
  thickness,
  color,
}: {
  w: number
  h: number
  thickness: number
  color: string
}) {
  const t = thickness
  return (
    <group position={[0, 0, 0.006]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w + t, t, t]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, -h / 2, 0]}>
        <boxGeometry args={[w + t, t, t]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[w / 2, 0, 0]}>
        <boxGeometry args={[t, h + t, t]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[-w / 2, 0, 0]}>
        <boxGeometry args={[t, h + t, t]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

function Stand({
  selected,
  closeup,
  lang,
  epoch,
  part,
  clampNotes,
  pose,
  onOpen,
  onPickPart,
}: {
  selected: boolean
  closeup: boolean
  lang: Lang
  epoch: number
  part: PartId | null
  clampNotes: boolean
  pose: 0 | 1 | 2
  onOpen: () => void
  onPickPart: (part: PartId) => void
}) {
  const pivot = useRef<Group>(null)
  const tilt = useRef<number>(POSE_X[0])
  const reduce = useRef(false)
  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])
  useFrame((_, delta) => {
    const goal = POSE_X[pose]
    if (reduce.current) tilt.current = goal
    else tilt.current += (goal - tilt.current) * (1 - Math.exp(-3.4 * delta))
    if (pivot.current) pivot.current.rotation.x = tilt.current
  })
  const metal = { color: '#c8c2b8', metalness: 0.16, roughness: 0.5 }
  const pole = { color: '#b7b1a6', metalness: 0.2, roughness: 0.42 }
  const clampEmissive = clampNotes ? '#5e5a55' : '#000000'
  const clampIntensity = clampNotes ? 0.28 : 0

  return (
    <group
      onClick={(event) => {
        if (closeup) return
        event.stopPropagation()
        onOpen()
      }}
    >
      <mesh
        position={[0, 0.008, 0.012]}
        castShadow
        {...(closeup ? pickHandlers(() => onPickPart('j02-size')) : {})}
      >
        <boxGeometry args={[0.2, 0.014, 0.12]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {[-0.082, 0.082].map((x) => (
        <group key={x}>
          <mesh
            position={[x, 0.125, 0]}
            castShadow
            {...(closeup ? pickHandlers(() => onPickPart('j02-poles')) : {})}
          >
            <cylinderGeometry args={[0.007, 0.007, 0.23, 14]} />
            <meshStandardMaterial {...pole} />
          </mesh>
          <mesh position={[x, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.012, 0.0026, 8, 18]} />
            <meshStandardMaterial color="#9a948c" metalness={0.16} roughness={0.45} />
          </mesh>
        </group>
      ))}
      <group position={[0, 0.245, 0.028]}>
        <mesh
          rotation={[0, 0, Math.PI / 2]}
          castShadow
          {...(closeup ? pickHandlers(() => onPickPart('j02-hinge')) : {})}
        >
          <cylinderGeometry args={[0.012, 0.012, 0.22, 16]} />
          <meshStandardMaterial color="#8f8a83" metalness={0.22} roughness={0.38} />
        </mesh>
        <group ref={pivot}>
          <mesh
            position={[0, -0.09, 0]}
            castShadow
            {...(closeup ? pickHandlers(() => onPickPart('j02-hinge')) : {})}
          >
            <boxGeometry args={[0.11, 0.18, 0.006]} />
            <meshStandardMaterial color="#d2ccc3" metalness={0.14} roughness={0.48} />
          </mesh>
          <group position={[0, -0.172, 0.01]}>
            <mesh castShadow {...(closeup ? pickHandlers(() => onPickPart('j02-clamp')) : {})}>
              <boxGeometry args={[0.078, 0.016, 0.01]} />
              <meshStandardMaterial
                color="#6e6a62"
                metalness={0.18}
                roughness={0.42}
                emissive={clampEmissive}
                emissiveIntensity={clampIntensity}
              />
            </mesh>
            <mesh
              position={[0, 0.004, -0.01]}
              castShadow
              {...(closeup ? pickHandlers(() => onPickPart('j02-clamp')) : {})}
            >
              <boxGeometry args={[0.078, 0.012, 0.006]} />
              <meshStandardMaterial
                color="#5e5a55"
                metalness={0.16}
                roughness={0.44}
                emissive={clampEmissive}
                emissiveIntensity={clampIntensity}
              />
            </mesh>
            <mesh
              position={[0, 0, 0.012]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
              {...(closeup ? pickHandlers(() => onPickPart('j02-clamp')) : {})}
            >
              <cylinderGeometry args={[0.009, 0.009, 0.012, 12]} />
              <meshStandardMaterial
                color="#4e4a45"
                metalness={0.16}
                roughness={0.46}
                emissive={clampEmissive}
                emissiveIntensity={clampIntensity}
              />
            </mesh>
            {clampNotes ? (
              <group position={[0, -0.045, 0]}>
                <EdgeRect w={0.084} h={0.06} />
              </group>
            ) : null}
            {closeup ? (
              <OutlineHotspot
                radius={0.02}
                hit={0.05}
                selected={part === 'j02-clamp' || clampNotes}
                onActivate={() => onPickPart('j02-clamp')}
                label={PARTS['j02-clamp'].label}
                lang={lang}
                epoch={epoch}
                labelOffset={[-1.35, -0.2]}
              />
            ) : null}
          </group>
        </group>
        {closeup ? (
          <group position={[0.12, 0.045, 0.04]}>
            <OutlineHotspot
              radius={0.02}
              hit={0.05}
              selected={part === 'j02-hinge'}
              onActivate={() => onPickPart('j02-hinge')}
              label={PARTS['j02-hinge'].label}
              lang={lang}
              epoch={epoch}
              labelOffset={[0.85, 0.7]}
            />
          </group>
        ) : null}
      </group>
      {closeup ? (
        <>
          <group position={[0.16, 0.16, 0.06]}>
            <OutlineHotspot
              radius={0.026}
              hit={0.055}
              selected={part === 'j02-poles'}
              onActivate={() => onPickPart('j02-poles')}
              label={PARTS['j02-poles'].label}
              lang={lang}
              epoch={epoch}
              labelOffset={[1, 0.45]}
            />
          </group>
          <group position={[-0.02, 0.04, 0.12]}>
            <OutlineHotspot
              radius={0.018}
              hit={0.048}
              selected={part === 'j02-size'}
              onActivate={() => onPickPart('j02-size')}
              label={PARTS['j02-size'].label}
              lang={lang}
              epoch={epoch}
              labelOffset={[-1.15, -0.45]}
            />
          </group>
        </>
      ) : (
        <group position={[0, 0.18, 0.04]}>
          <mesh {...pickHandlers(onOpen)}>
            <boxGeometry args={[0.36, 0.46, 0.32]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <group position={[0, 0.16, 0.04]}>
            <OutlineHotspot
              radius={0.042}
              hit={0.07}
              selected={selected}
              onActivate={onOpen}
              lang={lang}
              epoch={epoch}
            />
          </group>
        </group>
      )}
    </group>
  )
}

function FactCard({
  sku,
  lang,
  epoch,
  selected,
  position,
  onOpen,
}: {
  sku: Sku
  lang: Lang
  epoch: number
  selected: boolean
  position: [number, number, number]
  onOpen: () => void
}) {
  const image = usePanel(
    useMemo(() => {
      void epoch
      return makeFactPanel(sku, lang)
    }, [sku, lang, epoch]),
  )
  const w = 1.16
  const h = Math.min(2.12, w / image.aspect)
  return (
    <group position={position}>
      <RectOutline
        w={w}
        h={h}
        thickness={selected ? 0.038 : 0.01}
        color={selected ? '#5e5a55' : '#6a655f'}
      />
      <mesh
        position={[0, 0, 0]}
        onClick={(event) => {
          event.stopPropagation()
          onOpen()
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = ''
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={image.texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

function ScreenPanel({
  mode,
  lang,
  epoch,
}: {
  mode: 'welcome' | 'close' | Sku
  lang: Lang
  epoch: number
}) {
  const image = usePanel(
    useMemo(() => {
      void epoch
      return makeScreenPanel(mode, lang)
    }, [mode, lang, epoch]),
  )
  const w = 1.18
  const h = Math.min(2.05, w / image.aspect)
  return (
    <group position={[0.07, 1.38, 3.55]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0, -0.016]} castShadow>
        <boxGeometry args={[w + 0.06, h + 0.06, 0.018]} />
        <meshStandardMaterial color="#ebe6de" roughness={0.92} metalness={0} />
      </mesh>
      <mesh position={[0, 0, 0.004]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={image.texture} toneMapped={false} side={DoubleSide} />
      </mesh>
    </group>
  )
}

function Room(props: ShowroomProps & { epoch: number }) {
  const closeup = props.zone === 'closeup'
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3, 0, 3]} receiveShadow>
        <planeGeometry args={[18, 18]} />
        <meshStandardMaterial color="#d5cfc3" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[3.15, 1.6, -0.04]} receiveShadow>
        <boxGeometry args={[7.5, 3.2, 0.08]} />
        <meshStandardMaterial color="#f3f1ec" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[-0.04, 1.6, 2.85]} receiveShadow>
        <boxGeometry args={[0.08, 3.2, 6.7]} />
        <meshStandardMaterial color="#f3f1ec" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[J03.x, 0.2, J03.z]} castShadow receiveShadow>
        <boxGeometry args={[0.66, 0.4, 0.66]} />
        <meshStandardMaterial color="#ebe6de" roughness={0.96} metalness={0} />
      </mesh>
      <mesh position={[J02.x, 0.2, J02.z]} castShadow receiveShadow>
        <boxGeometry args={[0.66, 0.4, 0.66]} />
        <meshStandardMaterial color="#ebe6de" roughness={0.96} metalness={0} />
      </mesh>
      <group position={[J03.x, 0.4, J03.z]}>
        <Tray
          selected={props.sku === 'J03-01'}
          closeup={closeup && props.sku === 'J03-01'}
          lang={props.lang}
          epoch={props.epoch}
          part={props.part}
          sizeMarks={props.sizeMarks && closeup && props.sku === 'J03-01'}
          rimOrbit={props.rimOrbit && closeup && props.sku === 'J03-01'}
          onOpen={() => props.onOpenSku('J03-01')}
          onPickPart={props.onPickPart}
          onRimOrbitDone={props.onRimOrbitDone}
        />
      </group>
      <group position={[J02.x, 0.4, J02.z]}>
        <Stand
          selected={props.sku === 'J02-01'}
          closeup={closeup && props.sku === 'J02-01'}
          lang={props.lang}
          epoch={props.epoch}
          part={props.part}
          clampNotes={props.clampNotes && closeup && props.sku === 'J02-01'}
          pose={props.pose}
          onOpen={() => props.onOpenSku('J02-01')}
          onPickPart={props.onPickPart}
        />
      </group>
      <FactCard
        sku="J03-01"
        lang={props.lang}
        epoch={props.epoch}
        selected={props.sku === 'J03-01'}
        position={[J03.x, 1.5, 0.02]}
        onOpen={() => props.onOpenSku('J03-01')}
      />
      <FactCard
        sku="J02-01"
        lang={props.lang}
        epoch={props.epoch}
        selected={props.sku === 'J02-01'}
        position={[J02.x, 1.5, 0.02]}
        onOpen={() => props.onOpenSku('J02-01')}
      />
      <ScreenPanel mode={props.screen} lang={props.lang} epoch={props.epoch} />
      <group position={[GUIDE.x, 0, GUIDE.z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
          <ringGeometry args={[0.1, 0.112, 48]} />
          <meshBasicMaterial color="#6a655f" side={DoubleSide} />
        </mesh>
        <group position={[0, 0.86, 0]}>
          <OutlineHotspot
            radius={0.045}
            selected={props.zone === 'guide'}
            onActivate={props.onGuide}
            lang={props.lang}
            epoch={props.epoch}
          />
        </group>
      </group>
    </group>
  )
}

function configureRenderer(gl: WebGLRenderer): void {
  gl.toneMapping = NeutralToneMapping
  gl.toneMappingExposure = 1.12
}

export default function Showroom(props: ShowroomProps) {
  const epoch = useFontEpoch()
  const cameraKey = `${props.zone}:${props.zone === 'closeup' ? (props.sku ?? '') : ''}:${props.frameNonce}`
  const overview = cameraGoal('overview', null)
  return (
    <Canvas
      className="webgl"
      dpr={[1, 1.25]}
      camera={{ fov: 36, near: 0.04, far: 40, position: overview.pos }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, camera }) => {
        configureRenderer(gl)
        camera.lookAt(overview.target[0], overview.target[1], overview.target[2])
        requestAnimationFrame(() => props.onReady())
      }}
    >
      <color attach="background" args={['#e8e5e0']} />
      <hemisphereLight args={['#f6f8fb', '#e6dfd4', 0.92]} />
      <ambientLight color="#f7f6f3" intensity={0.62} />
      <directionalLight color="#f4f7fb" intensity={1.25} position={[3.2, 6.4, 4.6]} />
      <CameraRig cameraKey={cameraKey} onReady={props.onReady} />
      <Room {...props} epoch={epoch} />
    </Canvas>
  )
}
