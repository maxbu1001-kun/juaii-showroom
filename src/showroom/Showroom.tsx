import { CameraControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import CameraControlsImpl from 'camera-controls'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  Box3,
  CanvasTexture,
  Color,
  CubeReflectionMapping,
  CubeTexture,
  DataTexture,
  DoubleSide,
  FrontSide,
  LinearToneMapping,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { DirectionalLight, Group, Material, Mesh, Object3D, WebGLRenderer } from 'three'
import { PARTS } from '../copy'
import type { Lang, Pair, PartId, Sku, Zone } from '../copy'
import { Hall } from './Hall'
import { HallLights } from './HallLights'
import { cardMounts, closeupGoal, guidePost, plinths, SCREEN_D, SCREEN_W, screenCamera, screenMount } from './plan'
import type { RoomId, WalkPose } from './plan'
import { PlanView, Walker } from './Walker'
import type { MovePad } from './Walker'
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
  mode: 'walk' | 'plan' | 'closeup'
  spawn: { serial: number; pose: WalkPose }
  padRef: RefObject<MovePad>
  lightRoom: RoomId
  approach: { j03: boolean; j02: boolean }
  onPose: (pose: WalkPose & { room: RoomId }) => void
  onPickRoom: (room: RoomId) => void
}

/** Human-scale room. 1 unit = 1 meter. Inner faces meet at x0/z0; the front plane is open. */
const ROOM = {
  x0: 0,
  x1: 6.4,
  z0: 0,
  z1: 5.6,
  h: 2.62,
  t: 0.22,
  skirtH: 0.09,
  skirtD: 0.02,
}

const PLINTH_H = 0.08
const RIM_ENV_INTENSITY = 1.46
const RIM_ENV_J03 = 1.9

function makeRimEnv(): CubeTexture {
  const size = 64
  const face = (kind: 'band' | 'grey' | 'top') => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const g = canvas.getContext('2d')
    if (!g) return canvas
    g.fillStyle = '#4a4a4a'
    g.fillRect(0, 0, size, size)
    if (kind === 'band') {
      for (let y = 0; y < size; y++) {
        const band = Math.exp(-((y - 24) ** 2) / (2 * 16 ** 2))
        const v = Math.round(74 + 150 * band)
        g.fillStyle = `rgb(${v},${v},${v})`
        g.fillRect(0, y, size, 1)
      }
    }
    if (kind === 'top') {
      const mid = (size - 1) / 2
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const d = Math.hypot(x - mid, y - mid) / mid
          const band = Math.exp(-(d * d) / (2 * 0.7 * 0.7))
          const v = Math.round(90 + 130 * band)
          g.fillStyle = `rgb(${v},${v},${v})`
          g.fillRect(x, y, 1, 1)
        }
      }
    }
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    return tex.image as HTMLCanvasElement
  }
  const cube = new CubeTexture([face('band'), face('band'), face('top'), face('grey'), face('band'), face('grey')])
  cube.colorSpace = SRGBColorSpace
  cube.mapping = CubeReflectionMapping
  cube.needsUpdate = true
  return cube
}

let rimEnv: CubeTexture | null = null
function rimEnvMap(): CubeTexture {
  rimEnv ??= makeRimEnv()
  return rimEnv
}

function makeDecalMap(): DataTexture {
  const size = 128
  const data = new Uint8Array(size * size * 4)
  const half = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - half, y - half) / half
      const alpha = r < 0.62 ? 0.42 : r < 1 ? 0.42 * (1 - (r - 0.62) / 0.38) : 0
      const i = (y * size + x) * 4
      data[i] = 12
      data[i + 1] = 11
      data[i + 2] = 10
      data[i + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    }
  }
  const tex = new DataTexture(data, size, size)
  tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}
const PLINTH_S = 0.46
const POST_H = 0.62
const SCREEN_H = (SCREEN_W * 9) / 16
const POSE_X = [-0.36, -0.74, -1.12] as const

const CAM_BOX = {
  minX: 0.22,
  maxX: ROOM.x1 - 0.22,
  minY: 0.18,
  maxY: ROOM.h - 0.2,
  minZ: 0.26,
  maxZ: ROOM.z1 - 0.28,
}

type Goal = { pos: [number, number, number]; target: [number, number, number] }

const _lerpP = new Vector3()
const _lerpT = new Vector3()
const _sep = new Vector3()
const _goalSep = new Vector3()
const _ndc = new Vector3()
const _ray = new Vector3()
const flightGate = { active: false }

function clampInto(p: Vector3): void {
  p.x = Math.min(CAM_BOX.maxX, Math.max(CAM_BOX.minX, p.x))
  p.y = Math.min(CAM_BOX.maxY, Math.max(CAM_BOX.minY, p.y))
  p.z = Math.min(CAM_BOX.maxZ, Math.max(CAM_BOX.minZ, p.z))
}

function cameraGoal(zone: Zone, sku: Sku | null): Goal {
  if (zone === 'closeup') return closeupGoal(sku ?? 'J03-01')
  if (zone === 'screen') return screenCamera()
  switch (zone) {
    case 'j03':
      return { pos: [2.35, 1.12, 4.2], target: [1.35, 0.65, 1.25] }
    case 'j02':
      return { pos: [3.45, 1.08, 3.3], target: [4.55, 0.5, 1.15] }
    case 'wall':
      return { pos: [3.2, 1.5, 4.48], target: [3.2, 1.32, 0.12] }
    case 'guide':
      return { pos: [3.2, 1.57, 4.95], target: [3.2, 0.95, 1.2] }
    default:
      return { pos: [4.7, 1.5, 5.1], target: [3.4, 1.0, 1.05] }
  }
}

function rayLeavesThroughOpening(origin: Vector3, dir: Vector3): boolean {
  const { x0, x1, z0, z1, h } = ROOM
  if (dir.z <= 1e-5) return false
  const tOpen = (z1 - origin.z) / dir.z
  if (tOpen <= 0.02) return false
  const x = origin.x + dir.x * tOpen
  const y = origin.y + dir.y * tOpen
  const inAperture = x > x0 + 0.04 && x < x1 - 0.04 && y > 0.06 && y < h - 0.06
  if (!inAperture) return false
  if (dir.y < -1e-5) {
    const t = -origin.y / dir.y
    if (t > 0 && t < tOpen) {
      const hx = origin.x + dir.x * t
      const hz = origin.z + dir.z * t
      if (hx >= x0 && hx <= x1 && hz >= z0 && hz <= z1) return false
    }
  }
  if (dir.y > 1e-5) {
    const t = (h - origin.y) / dir.y
    if (t > 0 && t < tOpen) {
      const hx = origin.x + dir.x * t
      const hz = origin.z + dir.z * t
      if (hx >= x0 && hx <= x1 && hz >= z0 && hz <= z1) return false
    }
  }
  if (dir.x < -1e-5) {
    const t = (x0 - origin.x) / dir.x
    if (t > 0 && t < tOpen) {
      const hy = origin.y + dir.y * t
      const hz = origin.z + dir.z * t
      if (hy >= 0 && hy <= h && hz >= z0 && hz <= z1) return false
    }
  }
  if (dir.x > 1e-5) {
    const t = (x1 - origin.x) / dir.x
    if (t > 0 && t < tOpen) {
      const hy = origin.y + dir.y * t
      const hz = origin.z + dir.z * t
      if (hy >= 0 && hy <= h && hz >= z0 && hz <= z1) return false
    }
  }
  if (dir.z < -1e-5) {
    const t = (z0 - origin.z) / dir.z
    if (t > 0 && t < tOpen) {
      const hx = origin.x + dir.x * t
      const hy = origin.y + dir.y * t
      if (hx >= x0 && hx <= x1 && hy >= 0 && hy <= h) return false
    }
  }
  return true
}

function poseLeavesRoom(camera: { position: Vector3; updateMatrixWorld: () => void; projectionMatrix: unknown }): boolean {
  const origin = camera.position
  if (
    origin.x < CAM_BOX.minX - 0.02 ||
    origin.x > CAM_BOX.maxX + 0.02 ||
    origin.y < CAM_BOX.minY - 0.02 ||
    origin.y > CAM_BOX.maxY + 0.02 ||
    origin.z < CAM_BOX.minZ - 0.02 ||
    origin.z > CAM_BOX.maxZ + 0.02
  ) {
    return true
  }
  camera.updateMatrixWorld()
  const corners: Array<[number, number]> = [
    [0, 0],
    [-0.96, -0.96],
    [0.96, -0.96],
    [-0.96, 0.96],
    [0.96, 0.96],
  ]
  for (const [x, y] of corners) {
    _ndc.set(x, y, 0.5)
    _ndc.unproject(camera as never)
    _ray.copy(_ndc).sub(origin)
    if (_ray.lengthSq() < 1e-8) continue
    _ray.normalize()
    if (rayLeavesThroughOpening(origin, _ray)) return true
  }
  return false
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
  t: number
}

function CameraRig({
  cameraKey,
  onReady,
  controlsRef,
}: {
  cameraKey: string
  onReady: () => void
  controlsRef: RefObject<CameraControlsImpl | null>
}) {
  const readyOnce = useRef(false)
  const seen = useRef<string | null>(null)
  const flight = useRef<Flight | null>(null)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const cancelFlight = () => {
      flight.current = null
      flightGate.active = false
    }
    controls.addEventListener('controlstart', cancelFlight)
    return () => controls.removeEventListener('controlstart', cancelFlight)
  }, [controlsRef])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Canonical poses stay inside these stops, so a later orbit cannot pull them off.
    controls.minPolarAngle = 0.42
    controls.maxPolarAngle = Math.PI / 2 - 0.008
    controls.minAzimuthAngle = -1.25
    controls.maxAzimuthAngle = 1.45
    controls.minDistance = 0.34
    controls.maxDistance = 5.5
    controls.smoothTime = reduce ? 0 : 0.45
    controls.draggingSmoothTime = 0.1
    controls.dollySpeed = 0.38
    controls.azimuthRotateSpeed = 0.72
    controls.polarRotateSpeed = 0.52
    controls.infinityDolly = false
    controls.boundaryEnclosesCamera = true
    controls.setBoundary(
      new Box3(
        new Vector3(0.05, 0.06, 0.05),
        new Vector3(ROOM.x1 - 0.1, ROOM.h - 0.16, ROOM.z1 - 0.22),
      ),
    )
    const shell = scene.getObjectByName('room-shell')
    if (shell) {
      const meshes: Mesh[] = []
      shell.traverse((obj) => {
        const mesh = obj as Mesh
        if (mesh.isMesh) meshes.push(mesh)
      })
      controls.colliderMeshes = meshes
    }
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
      flightGate.active = false
      void controls.setLookAt(toP.x, toP.y, toP.z, toT.x, toT.y, toT.z, false)
    } else {
      const fromP = new Vector3()
      const fromT = new Vector3()
      controls.getPosition(fromP, false)
      controls.getTarget(fromT, false)
      flight.current = { fromP, fromT, toP, toT, t: 0 }
      flightGate.active = true
    }
    if (!readyOnce.current) {
      readyOnce.current = true
      requestAnimationFrame(() => onReady())
    }
  }, [cameraKey, onReady, controlsRef, scene])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    const fly = flight.current
    flightGate.active = fly !== null
    if (!controls || !fly) return
    fly.t = Math.min(1, fly.t + delta / 0.58)
    const k = fly.t >= 1 ? 1 : 1 - (1 - fly.t) ** 3
    _lerpP.copy(fly.fromP).lerp(fly.toP, k)
    _lerpT.copy(fly.fromT).lerp(fly.toT, k)
    clampInto(_lerpP)
    _sep.subVectors(_lerpP, _lerpT)
    if (_sep.length() < 0.42) {
      _goalSep.subVectors(fly.toP, fly.toT)
      if (_goalSep.lengthSq() > 1e-6) {
        _sep.lerp(_goalSep.normalize(), 0.7)
      }
      if (_sep.lengthSq() < 1e-6) _sep.set(0, 0.2, 1)
      _lerpP.copy(_lerpT).addScaledVector(_sep.normalize(), 0.42)
      clampInto(_lerpP)
    }
    const done = fly.t >= 1
    const p = done ? fly.toP : _lerpP
    const t = done ? fly.toT : _lerpT
    void controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, false)
    if (done) {
      flight.current = null
      flightGate.active = false
    }
  })

  return <CameraControls ref={controlsRef} makeDefault dollyToCursor={false} />
}

export function Confine({
  controlsRef,
}: {
  controlsRef: RefObject<CameraControlsImpl | null>
}) {
  const lastGood = useRef<{ p: Vector3; t: Vector3 } | null>(null)
  const scratchP = useMemo(() => new Vector3(), [])
  const scratchT = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const controls = controlsRef.current
    if (!controls || flightGate.active) return
    const camera = controls.camera
    if (!camera || !('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return
    controls.update(0)
    if (!poseLeavesRoom(camera)) {
      if (!lastGood.current) lastGood.current = { p: new Vector3(), t: new Vector3() }
      lastGood.current.p.copy(camera.position)
      controls.getTarget(scratchT, false)
      lastGood.current.t.copy(scratchT)
      return
    }
    const good = lastGood.current
    if (!good) return
    scratchP.copy(good.p)
    scratchT.copy(good.t)
    void controls.setLookAt(scratchP.x, scratchP.y, scratchP.z, scratchT.x, scratchT.y, scratchT.z, false)
    controls.update(0)
  })

  return null
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
  approach,
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
  approach: boolean
}) {
  const map = useMemo(() => getBrushedMap(), [])
  const trayMat = useMemo(
    () =>
      new MeshPhysicalMaterial({
        map,
        color: '#d5d9dd',
        metalness: 0.48,
        roughness: 0.34,
        anisotropy: 0.85,
        anisotropyRotation: Math.PI / 2,
        side: DoubleSide,
        envMap: rimEnvMap(),
        envMapIntensity: RIM_ENV_J03,
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
        : approach ? (
          <group position={[0, 0.05, 0]}>
            <OutlineHotspot
              radius={0.032}
              selected={selected}
              onActivate={onOpen}
              lang={lang}
              epoch={epoch}
            />
          </group>
        ) : null}
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
  approach,
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
  approach: boolean
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
  const reflect = { envMap: rimEnvMap(), envMapIntensity: RIM_ENV_INTENSITY }
  const metal = { color: '#c8c2b8', metalness: 0.42, roughness: 0.34, ...reflect }
  const pole = { color: '#b7b1a6', metalness: 0.46, roughness: 0.3, ...reflect }
  const clampEmissive = clampNotes ? '#5e5a55' : '#000000'
  const clampIntensity = clampNotes ? 0.28 : 0

  return (
    <group
      userData={{ measure: 'J02' }}
      ref={(node) => {
        node?.traverse((child) => {
          if ((child as Mesh).isMesh) child.castShadow = true
        })
      }}
      onClick={(event) => {
        if (closeup) return
        event.stopPropagation()
        onOpen()
      }}
    >
      <mesh
        position={[0, 0.008, 0.012]}
        {...(closeup ? pickHandlers(() => onPickPart('j02-size')) : {})}
      >
        <boxGeometry args={[0.2, 0.014, 0.12]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {[-0.082, 0.082].map((x) => (
        <group key={x}>
          <mesh
            position={[x, 0.125, 0]}
            {...(closeup ? pickHandlers(() => onPickPart('j02-poles')) : {})}
          >
            <cylinderGeometry args={[0.007, 0.007, 0.23, 14]} />
            <meshStandardMaterial {...pole} />
          </mesh>
          <mesh position={[x, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.012, 0.0026, 8, 18]} />
            <meshStandardMaterial color="#9a948c" metalness={0.4} roughness={0.34} {...reflect} />
          </mesh>
        </group>
      ))}
      <group position={[0, 0.245, 0.028]}>
        <mesh
          rotation={[0, 0, Math.PI / 2]}
          {...(closeup ? pickHandlers(() => onPickPart('j02-hinge')) : {})}
        >
          <cylinderGeometry args={[0.012, 0.012, 0.22, 16]} />
          <meshStandardMaterial color="#8f8a83" metalness={0.48} roughness={0.28} {...reflect} />
        </mesh>
        <group ref={pivot}>
          <mesh
            position={[0, -0.09, 0]}
            castShadow
            userData={{ measure: 'J02F' }}
            {...(closeup ? pickHandlers(() => onPickPart('j02-hinge')) : {})}
          >
            <boxGeometry args={[0.11, 0.18, 0.006]} />
            <meshStandardMaterial color="#d2ccc3" metalness={0.36} roughness={0.36} {...reflect} />
          </mesh>
          <group position={[0, -0.172, 0.01]}>
            <mesh {...(closeup ? pickHandlers(() => onPickPart('j02-clamp')) : {})}>
              <boxGeometry args={[0.078, 0.016, 0.01]} />
              <meshStandardMaterial
                color="#6e6a62"
                metalness={0.4}
                roughness={0.34}
                {...reflect}
                emissive={clampEmissive}
                emissiveIntensity={clampIntensity}
              />
            </mesh>
            <mesh
              position={[0, 0.004, -0.01]}
              {...(closeup ? pickHandlers(() => onPickPart('j02-clamp')) : {})}
            >
              <boxGeometry args={[0.078, 0.012, 0.006]} />
              <meshStandardMaterial
                color="#5e5a55"
                metalness={0.38}
                roughness={0.34}
                {...reflect}
                emissive={clampEmissive}
                emissiveIntensity={clampIntensity}
              />
            </mesh>
            <mesh
              position={[0, 0, 0.012]}
              rotation={[Math.PI / 2, 0, 0]}
              {...(closeup ? pickHandlers(() => onPickPart('j02-clamp')) : {})}
            >
              <cylinderGeometry args={[0.009, 0.009, 0.012, 12]} />
              <meshStandardMaterial
                color="#4e4a45"
                metalness={0.38}
                roughness={0.34}
                {...reflect}
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
      ) : approach ? (
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
      ) : null}
    </group>
  )
}

function FactCard({
  sku,
  lang,
  epoch,
  selected,
  position,
  rotation = [0, 0, 0],
  onOpen,
}: {
  sku: Sku
  lang: Lang
  epoch: number
  selected: boolean
  position: [number, number, number]
  rotation?: [number, number, number]
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
    <group position={position} rotation={rotation}>
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
  const mount = screenMount()
  const image = usePanel(
    useMemo(() => {
      void epoch
      return makeScreenPanel(mode, lang)
    }, [mode, lang, epoch]),
  )
  const bezel = 0.03
  return (
    <group position={[mount.x, mount.y, mount.z]} rotation={[0, mount.rotY, 0]}>
      <mesh>
        <boxGeometry args={[SCREEN_W + bezel, SCREEN_H + bezel, SCREEN_D]} />
        <meshStandardMaterial color="#ebe6de" roughness={0.96} metalness={0} />
      </mesh>
      <mesh position={[0, 0, SCREEN_D / 2 + 0.001]}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial map={image.texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function RoomShell({
  wall,
  floor,
  ceil,
}: {
  wall: MeshStandardMaterial
  floor: MeshStandardMaterial
  ceil: MeshStandardMaterial
}) {
  const { x0, x1, z0, z1, h, t, skirtH, skirtD } = ROOM
  const width = x1 - x0
  const depth = z1 - z0
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const shellW = width + t * 2
  const sideDepth = depth + 0.02
  return (
    <group>
      <mesh position={[cx, -0.025, cz]} material={floor}>
        <boxGeometry args={[width, 0.05, depth]} />
      </mesh>
      <mesh position={[cx, h / 2, -t / 2]} material={wall}>
        <boxGeometry args={[shellW, h + 0.02, t]} />
      </mesh>
      <mesh position={[-t / 2, h / 2, cz - 0.01]} material={wall}>
        <boxGeometry args={[t, h + 0.02, sideDepth]} />
      </mesh>
      <mesh position={[x1 + t / 2, h / 2, cz - 0.01]} material={wall}>
        <boxGeometry args={[t, h + 0.02, sideDepth]} />
      </mesh>
      <mesh position={[cx, h + 0.08, (z1 - t) / 2]} material={ceil}>
        <boxGeometry args={[shellW, 0.16, z1 + t]} />
      </mesh>
      <mesh position={[cx, skirtH / 2, skirtD / 2]} material={wall}>
        <boxGeometry args={[width - skirtD * 2, skirtH, skirtD]} />
      </mesh>
      <mesh position={[skirtD / 2, skirtH / 2, (z1 + skirtD) / 2]} material={wall}>
        <boxGeometry args={[skirtD, skirtH, z1 - skirtD]} />
      </mesh>
      <mesh position={[x1 - skirtD / 2, skirtH / 2, (z1 + skirtD) / 2]} material={wall}>
        <boxGeometry args={[skirtD, skirtH, z1 - skirtD]} />
      </mesh>
    </group>
  )
}

export function RoomLights() {
  const wash = useRef<DirectionalLight>(null)
  const washAt = useRef<Object3D>(null)
  const bounce = useRef<DirectionalLight>(null)
  const bounceAt = useRef<Object3D>(null)
  const sideFill = useRef<DirectionalLight>(null)
  const sideFillAt = useRef<Object3D>(null)
  useEffect(() => {
    if (wash.current && washAt.current) wash.current.target = washAt.current
    if (bounce.current && bounceAt.current) bounce.current.target = bounceAt.current
    if (sideFill.current && sideFillAt.current) sideFill.current.target = sideFillAt.current
  }, [])
  return (
    <>
      <hemisphereLight args={['#f7f6f3', '#e7e2da', 0.62]} />
      <ambientLight color="#f4f2ee" intensity={0.55} />
      <directionalLight ref={wash} color="#f6f5f2" intensity={0.95} position={[3.2, 2.05, 6.6]} />
      <object3D ref={washAt} position={[3.2, 1.45, 0]} />
      <directionalLight ref={bounce} color="#f3f1ec" intensity={1.15} position={[3.2, 0.15, 2.7]} />
      <object3D ref={bounceAt} position={[3.2, 2.7, 2.7]} />
      <directionalLight ref={sideFill} color="#f3f2ef" intensity={1.24} position={[5.8, 1.28, 1.9]} />
      <object3D ref={sideFillAt} position={[0.3, 1.2, 1.7]} />
      <pointLight color="#f3f2ef" intensity={1.4} distance={8} decay={2} position={[3.6, 1.35, 3.3]} />
      <pointLight color="#f3f2ef" intensity={1.8} distance={8} decay={2} position={[4.9, 1.45, 3.8]} />
    </>
  )
}

function BaseDecal({ x, z }: { x: number; z: number }) {
  const map = useMemo(() => makeDecalMap(), [])
  useEffect(() => () => map.dispose(), [map])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, PLINTH_H + 0.004, z]} renderOrder={2}>
      <planeGeometry args={[0.32, 0.32]} />
      <meshBasicMaterial
        map={map}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

function Room(props: ShowroomProps & { epoch: number }) {
  const closeup = props.zone === 'closeup'
  const plinth = useMemo(
    () => new MeshStandardMaterial({ color: '#ebe6de', roughness: 0.97, metalness: 0 }),
    [],
  )
  useEffect(() => () => plinth.dispose(), [plinth])
  const spots = plinths()
  const j03 = spots[0]
  const j02 = spots[1]
  const cards = cardMounts()
  const post = guidePost()
  return (
    <group>
      {spots.map((spot) => (
        <group key={spot.sku}>
          <mesh position={[spot.x, PLINTH_H / 2, spot.z]} material={plinth} receiveShadow userData={{ measure: spot.sku === 'J03-01' ? 'P03' : 'P02' }}>
            <boxGeometry args={[PLINTH_S, PLINTH_H, PLINTH_S]} />
          </mesh>
          <BaseDecal x={spot.x} z={spot.z} />
        </group>
      ))}
      <group position={[j03.x, PLINTH_H, j03.z]} userData={{ measure: 'J03' }}>
        <Tray
          selected={props.sku === 'J03-01'}
          closeup={closeup && props.sku === 'J03-01'}
          lang={props.lang}
          epoch={props.epoch}
          part={props.part}
          sizeMarks={props.sizeMarks && closeup && props.sku === 'J03-01'}
          rimOrbit={props.rimOrbit && closeup && props.sku === 'J03-01'}
          onOpen={() => {
            if (props.approach.j03) props.onOpenSku('J03-01')
          }}
          onPickPart={props.onPickPart}
          onRimOrbitDone={props.onRimOrbitDone}
          approach={props.approach.j03}
        />
      </group>
      <group position={[j02.x, PLINTH_H, j02.z]}>
        <Stand
          selected={props.sku === 'J02-01'}
          closeup={closeup && props.sku === 'J02-01'}
          lang={props.lang}
          epoch={props.epoch}
          part={props.part}
          clampNotes={props.clampNotes && closeup && props.sku === 'J02-01'}
          pose={props.pose}
          onOpen={() => {
            if (props.approach.j02) props.onOpenSku('J02-01')
          }}
          onPickPart={props.onPickPart}
          approach={props.approach.j02}
        />
      </group>
      {cards.map((card) => (
        <FactCard
          key={card.sku}
          sku={card.sku ?? 'J03-01'}
          lang={props.lang}
          epoch={props.epoch}
          selected={props.sku === card.sku}
          position={[card.x, card.y, card.z]}
          rotation={[0, card.rotY, 0]}
          onOpen={() => {
            if (card.sku) props.onOpenSku(card.sku)
          }}
        />
      ))}
      <ScreenPanel mode={props.screen} lang={props.lang} epoch={props.epoch} />
      <group position={[post.x, 0, post.z]}>
        <mesh position={[0, POST_H / 2, 0]} material={plinth}>
          <boxGeometry args={[0.045, POST_H, 0.045]} />
        </mesh>
      </group>
    </group>
  )
}

function ObjectMask() {
  const scene = useThree((state) => state.scene)
  const applied = useRef(false)
  useFrame(() => {
    if (new URLSearchParams(window.location.search).get('mask') !== '1') return
    scene.background = new Color('#000000')
    if (applied.current) return
    const keep = new Set<Object3D>()
    scene.traverse((obj) => {
      const id = obj.userData.measure as string | undefined
      if (id === 'J02' || id === 'J03' || id === 'P02' || id === 'P03' || id === 'J02F') obj.traverse((child) => keep.add(child))
    })
    if (keep.size === 0) return
    applied.current = true
    const blank = () => new MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false, depthWrite: false })
    const flat = (color: string) => new MeshBasicMaterial({ color, toneMapped: false, side: FrontSide })
    scene.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      if (!keep.has(mesh)) {
        mesh.visible = false
        return
      }
      let id = ''
      let cursor: Object3D | null = mesh
      while (cursor) {
        if (typeof cursor.userData.measure === 'string') {
          id = cursor.userData.measure
          break
        }
        cursor = cursor.parent
      }
      if (id === 'J02F') {
        mesh.material = [blank(), blank(), blank(), blank(), flat('#ffd000'), blank()]
        return
      }
      if (id === 'P02' || id === 'P03') {
        const color = id === 'P02' ? '#2a4aff' : '#2ad4ff'
        mesh.material = [blank(), blank(), flat(color), blank(), blank(), blank()]
        return
      }
      mesh.material = flat(id === 'J03' ? '#2aff4a' : '#ff2a6a')
      void (mesh.material as Material)
    })
  })
  return null
}

function configureRenderer(gl: WebGLRenderer): void {
  gl.toneMapping = LinearToneMapping
  gl.toneMappingExposure = 1.46
  gl.shadowMap.enabled = true
  gl.shadowMap.type = PCFSoftShadowMap
}

export default function Showroom(props: ShowroomProps) {
  const epoch = useFontEpoch()
  const controlsRef = useRef<CameraControlsImpl>(null)
  const cameraKey = `${props.zone}:${props.zone === 'closeup' ? (props.sku ?? '') : ''}:${props.frameNonce}`
  const start = props.spawn.pose
  return (
    <Canvas
      className="webgl"
      dpr={[1, 1.25]}
      camera={{ fov: 50, near: 0.06, far: 80, position: [start.x, start.y, start.z] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, camera }) => {
        configureRenderer(gl)
        camera.rotation.order = 'YXZ'
        camera.rotation.set(start.pitch, -start.yaw, 0)
        requestAnimationFrame(() => props.onReady())
      }}
    >
      <color attach="background" args={['#e8e5e0']} />
      <HallLights room={props.lightRoom} />
      <Hall />
      <ObjectMask />
      {props.mode === 'closeup' ? (
        <CameraRig cameraKey={cameraKey} onReady={props.onReady} controlsRef={controlsRef} />
      ) : null}
      {props.mode === 'plan' ? <PlanView active onPick={props.onPickRoom} /> : null}
      <Walker active={props.mode === 'walk'} spawn={props.spawn} padRef={props.padRef} onSample={props.onPose} />
      <Room {...props} epoch={epoch} />
    </Canvas>
  )
}
