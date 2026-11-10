import { CameraControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import CameraControlsImpl from 'camera-controls'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DoubleSide, MeshStandardMaterial, NeutralToneMapping } from 'three'
import type { Group, WebGLRenderer } from 'three'
import { PARTS } from '../copy'
import type { Lang, Pair, PartId, Sku, Zone } from '../copy'
import {
  getBrushedMap,
  makeFactPanel,
  makeMicroLabel,
  makeNote,
  makeScreenPanel,
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
      return { pos: [3.05, 1.5, 2.85], target: [3.05, 1.42, 0.02] }
    case 'guide':
      return { pos: [3.05, 1.28, 4.7], target: [GUIDE.x, 0.72, GUIDE.z] }
    case 'screen':
      return { pos: [2.15, 1.46, 3.55], target: [0.08, 1.42, 3.55] }
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

function CameraRig({ cameraKey, onReady }: { cameraKey: string; onReady: () => void }) {
  const ref = useRef<CameraControlsImpl>(null)
  const readyOnce = useRef(false)
  const seen = useRef<string | null>(null)

  useEffect(() => {
    const controls = ref.current
    if (!controls) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    controls.minPolarAngle = 0.38
    controls.maxPolarAngle = Math.PI / 2 - 0.045
    controls.minDistance = 0.18
    controls.maxDistance = 9
    controls.smoothTime = reduce ? 0 : 0.52
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
    void controls.setLookAt(
      goal.pos[0],
      goal.pos[1],
      goal.pos[2],
      goal.target[0],
      goal.target[1],
      goal.target[2],
      !first && !reduce,
    )
    if (!readyOnce.current) {
      readyOnce.current = true
      requestAnimationFrame(() => onReady())
    }
  }, [cameraKey, onReady])

  return <CameraControls ref={ref} makeDefault dollyToCursor={false} />
}

function OutlineHotspot({
  radius,
  selected,
  onActivate,
  label,
  lang,
  epoch,
}: {
  radius: number
  selected: boolean
  onActivate: () => void
  label?: Pair
  lang: Lang
  epoch: number
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
  return (
    <group ref={group}>
      <mesh>
        <torusGeometry args={[radius, tube, 8, 40]} />
        <meshBasicMaterial color={selected ? '#5e5a55' : '#6a655f'} />
      </mesh>
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          onActivate()
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = ''
        }}
      >
        <torusGeometry args={[radius, Math.max(0.014, radius * 0.34), 8, 24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {selected && label ? (
        <PartLabel label={label} lang={lang} epoch={epoch} radius={radius} />
      ) : null}
    </group>
  )
}

function PartLabel({
  label,
  lang,
  epoch,
  radius,
}: {
  label: Pair
  lang: Lang
  epoch: number
  radius: number
}) {
  const image = usePanel(
    useMemo(() => {
      void epoch
      return makeMicroLabel(label, lang)
    }, [label, lang, epoch]),
  )
  const w = 0.074
  const h = Math.min(0.05, w / image.aspect)
  return (
    <mesh position={[0, radius + h * 0.5 + 0.012, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={image.texture} toneMapped={false} />
    </mesh>
  )
}

function SizeMarks({ lang, epoch }: { lang: Lang; epoch: number }) {
  const image = usePanel(
    useMemo(() => {
      void epoch
      const lines = noteLines('size_weight', 'J03-01', lang)
      return makeNote(lines.zh, lines.en)
    }, [lang, epoch]),
  )
  const w = 0.2
  const h = Math.min(0.11, w / image.aspect)
  return (
    <group position={[0, 0.01, 0.115]}>
      <mesh position={[0, 0.03, -0.055]}>
        <boxGeometry args={[0.125, 0.0015, 0.0015]} />
        <meshBasicMaterial color="#6a655f" />
      </mesh>
      <mesh position={[0.066, 0.016, -0.045]}>
        <boxGeometry args={[0.0015, 0.026, 0.0015]} />
        <meshBasicMaterial color="#6a655f" />
      </mesh>
      <mesh position={[0, h * 0.5, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={image.texture} toneMapped={false} />
      </mesh>
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

  const parts = ['j03-rim', 'j03-size', 'j03-brushed', 'j03-use'] as const
  const place: Record<(typeof parts)[number], [number, number, number, number]> = {
    'j03-rim': [0.072, 0.03, 0, 0.013],
    'j03-size': [0.086, 0.02, 0.03, 0.011],
    'j03-brushed': [-0.012, 0.034, -0.01, 0.011],
    'j03-use': [0.01, 0.032, 0.04, 0.011],
  }

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
          <mesh position={[0, 0.013, 0]} material={trayMat} castShadow>
            <cylinderGeometry args={[0.0625, 0.0625, 0.026, 48, 1, true]} />
          </mesh>
          <mesh position={[0, 0.026, 0]} rotation={[-Math.PI / 2, 0, 0]} material={trayMat}>
            <ringGeometry args={[0.052, 0.0625, 48]} />
          </mesh>
          <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={trayMat}>
            <circleGeometry args={[0.052, 48]} />
          </mesh>
        </group>
      </group>
      {sizeMarks ? <SizeMarks lang={lang} epoch={epoch} /> : null}
      {closeup
        ? parts.map((id) => {
            const at = place[id]
            return (
              <group key={id} position={[at[0], at[1], at[2]]}>
                <OutlineHotspot
                  radius={at[3]}
                  selected={part === id || (id === 'j03-size' && sizeMarks)}
                  onActivate={() => onPickPart(id)}
                  label={PARTS[id].label}
                  lang={lang}
                  epoch={epoch}
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
  const t = 0.0016
  return (
    <group>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, t, t]} />
        <meshBasicMaterial color="#6a655f" />
      </mesh>
      <mesh position={[0, -h / 2, 0]}>
        <boxGeometry args={[w, t, t]} />
        <meshBasicMaterial color="#6a655f" />
      </mesh>
      <mesh position={[w / 2, 0, 0]}>
        <boxGeometry args={[t, h, t]} />
        <meshBasicMaterial color="#6a655f" />
      </mesh>
      <mesh position={[-w / 2, 0, 0]}>
        <boxGeometry args={[t, h, t]} />
        <meshBasicMaterial color="#6a655f" />
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
      <mesh position={[0, 0.008, 0.012]} castShadow>
        <boxGeometry args={[0.2, 0.014, 0.12]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {[-0.082, 0.082].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.125, 0]} castShadow>
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
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.22, 16]} />
          <meshStandardMaterial color="#8f8a83" metalness={0.22} roughness={0.38} />
        </mesh>
        <group ref={pivot}>
          <mesh position={[0, -0.09, 0]} castShadow>
            <boxGeometry args={[0.11, 0.18, 0.006]} />
            <meshStandardMaterial color="#d2ccc3" metalness={0.14} roughness={0.48} />
          </mesh>
          <group position={[0, -0.172, 0.01]}>
            <mesh castShadow>
              <boxGeometry args={[0.078, 0.016, 0.01]} />
              <meshStandardMaterial
                color="#6e6a62"
                metalness={0.18}
                roughness={0.42}
                emissive={clampEmissive}
                emissiveIntensity={clampIntensity}
              />
            </mesh>
            <mesh position={[0, 0.004, -0.01]} castShadow>
              <boxGeometry args={[0.078, 0.012, 0.006]} />
              <meshStandardMaterial
                color="#5e5a55"
                metalness={0.16}
                roughness={0.44}
                emissive={clampEmissive}
                emissiveIntensity={clampIntensity}
              />
            </mesh>
            <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]} castShadow>
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
                selected={part === 'j02-clamp' || clampNotes}
                onActivate={() => onPickPart('j02-clamp')}
                label={PARTS['j02-clamp'].label}
                lang={lang}
                epoch={epoch}
              />
            ) : null}
          </group>
        </group>
        {closeup ? (
          <group position={[0.085, 0, 0]}>
            <OutlineHotspot
              radius={0.02}
              selected={part === 'j02-hinge'}
              onActivate={() => onPickPart('j02-hinge')}
              label={PARTS['j02-hinge'].label}
              lang={lang}
              epoch={epoch}
            />
          </group>
        ) : null}
      </group>
      {closeup ? (
        <>
          <group position={[0.12, 0.12, 0.03]}>
            <OutlineHotspot
              radius={0.028}
              selected={part === 'j02-poles'}
              onActivate={() => onPickPart('j02-poles')}
              label={PARTS['j02-poles'].label}
              lang={lang}
              epoch={epoch}
            />
          </group>
          <group position={[0.11, 0.03, 0.05]}>
            <OutlineHotspot
              radius={0.018}
              selected={part === 'j02-size'}
              onActivate={() => onPickPart('j02-size')}
              label={PARTS['j02-size'].label}
              lang={lang}
              epoch={epoch}
            />
          </group>
        </>
      ) : (
        <group position={[0, 0.34, 0.08]}>
          <OutlineHotspot
            radius={0.042}
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
  const frame = selected ? 0.055 : 0.018
  return (
    <group position={position}>
      <mesh position={[0, 0, -0.008]}>
        <planeGeometry args={[w + frame, h + frame]} />
        <meshBasicMaterial color={selected ? '#5e5a55' : '#6a655f'} />
      </mesh>
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
  const cameraKey = `${props.zone}:${props.zone === 'closeup' ? (props.sku ?? '') : ''}`
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
      <color attach="background" args={['#f4f2ee']} />
      <hemisphereLight args={['#f6f8fb', '#e6dfd4', 0.92]} />
      <ambientLight color="#f7f6f3" intensity={0.62} />
      <directionalLight color="#f4f7fb" intensity={1.25} position={[3.2, 6.4, 4.6]} />
      <CameraRig cameraKey={cameraKey} onReady={props.onReady} />
      <Room {...props} epoch={epoch} />
    </Canvas>
  )
}
