import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { armGuideAudio, playClip, settleWelcome, tryWelcome, useActiveClip } from './audio'
import { PARTS, SUBTITLES } from './copy'
import type { FieldKey, Lang, PartId, Sku, Zone } from './copy'
import { entryPose, NOTE_ROOMS, plinths, roomAt, shotPose, standingPose, startPose, type RoomId, type WalkPose } from './showroom/plan'
import type { MovePad } from './showroom/Walker'
import { BrandBar, CatalogSheet, Disclaimer } from './ui'
import { WalkChrome } from './walk-ui'

const Showroom = lazy(() => import('./showroom/Showroom'))

function openingPose(): WalkPose {
  if (typeof window === 'undefined') return startPose()
  return shotPose(new URLSearchParams(window.location.search).get('shot')) ?? startPose()
}

type BoundaryState = { failed: boolean }

class SceneBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}

function hotFields(
  sku: Sku | null,
  part: PartId | null,
  useLimits: boolean,
  clampNotes: boolean,
  sizeMarks: boolean,
): FieldKey[] {
  const list: FieldKey[] = []
  if (part && sku && PARTS[part].sku === sku) {
    for (const field of PARTS[part].fields) list.push(field)
  }
  if (useLimits || (clampNotes && sku === 'J02-01')) {
    list.push('use_do', 'use_dont')
  }
  if (sizeMarks && sku === 'J03-01') list.push('size_weight')
  return list
}

export default function App() {
  const [lang, setLang] = useState<Lang>('both')
  const [zone, setZone] = useState<Zone>('overview')
  const [sku, setSku] = useState<Sku | null>(null)
  const [part, setPart] = useState<PartId | null>(null)
  const [sizeMarks, setSizeMarks] = useState(false)
  const [useLimits, setUseLimits] = useState(false)
  const [clampNotes, setClampNotes] = useState(false)
  const [pose, setPose] = useState<0 | 1 | 2>(0)
  const [rimOrbit, setRimOrbit] = useState(false)
  const [ready, setReady] = useState(false)
  const [frameNonce, setFrameNonce] = useState(0)
  const clip = useActiveClip()
  const skuRef = useRef(sku)
  const zoneRef = useRef(zone)
  const readyOnce = useRef(false)
  const [opening] = useState(openingPose)
  const openingRoom = roomAt(opening.x, opening.z) ?? 'B1'
  const poseRef = useRef<WalkPose>(opening)
  const savedPose = useRef<WalkPose>(opening)
  const roomRef = useRef<RoomId>(openingRoom)
  const noted = useRef(new Set<RoomId>())
  const headStamp = useRef(0)
  const pad = useRef<MovePad>({ x: 0, z: 0 })
  const [mode, setMode] = useState<'walk' | 'plan' | 'closeup'>('walk')
  const [spawn, setSpawn] = useState({ serial: 1, pose: opening })
  const [room, setRoom] = useState<RoomId>(openingRoom)
  const [heading, setHeading] = useState(opening.yaw)
  const [visited, setVisited] = useState<RoomId[]>([openingRoom])
  const [hintOn, setHintOn] = useState(true)
  const [noteOn, setNoteOn] = useState(false)
  const [feet, setFeet] = useState({ x: opening.x, z: opening.z })

  useEffect(() => {
    skuRef.current = sku
    zoneRef.current = zone
  }, [sku, zone])

  const markReady = useCallback(() => {
    if (readyOnce.current) return
    readyOnce.current = true
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    armGuideAudio()
    tryWelcome()
    const poster = document.getElementById('boot-poster')
    if (!poster) return
    poster.setAttribute('aria-hidden', 'true')
    poster.classList.add('is-gone')
    const timer = window.setTimeout(() => poster.remove(), 520)
    return () => window.clearTimeout(timer)
  }, [ready])

  const clearStudy = useCallback(() => {
    setPart(null)
    setSizeMarks(false)
    setUseLimits(false)
    setClampNotes(false)
    setRimOrbit(false)
  }, [])

  const bumpFrame = useCallback(() => {
    setFrameNonce((value) => value + 1)
  }, [])

  const restoreWalk = useCallback(
    (pose: WalkPose) => {
      setMode('walk')
      setZone('overview')
      setSpawn((current) => ({ serial: current.serial + 1, pose }))
    },
    [],
  )

  const openCloseup = useCallback(() => {
    if (!skuRef.current) return
    if (zoneRef.current !== 'closeup') savedPose.current = poseRef.current
    setZone('closeup')
    setMode('closeup')
    bumpFrame()
  }, [bumpFrame])

  const exitCloseup = useCallback(() => {
    clearStudy()
    restoreWalk(savedPose.current)
  }, [clearStudy, restoreWalk])

  const collapseFocus = useCallback(() => {
    const current = zoneRef.current
    clearStudy()
    setSku(null)
    if (current === 'closeup') restoreWalk(savedPose.current)
    void playClip('close').catch(() => {})
  }, [clearStudy, restoreWalk])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (zoneRef.current === 'closeup') {
        exitCloseup()
        return
      }
      if (skuRef.current) collapseFocus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exitCloseup, collapseFocus])

  const openObject = useCallback(
    (id: Sku) => {
      const prev = skuRef.current
      if (zoneRef.current !== 'closeup') savedPose.current = poseRef.current
      if (prev !== id) clearStudy()
      setSku(id)
      setZone('closeup')
      setMode('closeup')
      bumpFrame()
      settleWelcome()
      void playClip(id).catch(() => {})
    },
    [clearStudy, bumpFrame],
  )

  const onGuide = useCallback(() => {
    const current = skuRef.current
    if (!current) return
    settleWelcome()
    void playClip(current).catch(() => {})
  }, [])

  const onPose = useCallback((pose: WalkPose & { room: RoomId }) => {
    poseRef.current = pose
    if (pose.room !== roomRef.current) {
      roomRef.current = pose.room
      setRoom(pose.room)
      setVisited((current) => (current.includes(pose.room) ? current : [...current, pose.room]))
      if (NOTE_ROOMS.includes(pose.room) && !noted.current.has(pose.room)) {
        noted.current.add(pose.room)
        setNoteOn(true)
      }
    }
    const now = performance.now()
    if (now - headStamp.current > 90) {
      headStamp.current = now
      setHeading(pose.yaw)
      setFeet({ x: pose.x, z: pose.z })
    }
  }, [])

  useEffect(() => {
    if (!noteOn) return
    const timer = window.setTimeout(() => setNoteOn(false), 4200)
    return () => window.clearTimeout(timer)
  }, [noteOn, room])

  const goPlan = useCallback(() => {
    if (zoneRef.current === 'closeup') return
    setMode('plan')
  }, [])

  const pickRoom = useCallback(
    (id: RoomId) => {
      restoreWalk(entryPose(id))
    },
    [restoreWalk],
  )

  const backToExhibit = useCallback(() => {
    if (zoneRef.current === 'closeup') {
      clearStudy()
      setSku(null)
    }
    restoreWalk(standingPose())
  }, [clearStudy, restoreWalk])

  const cyclePose = useCallback(() => {
    setPose((current) => (current === 0 ? 1 : current === 1 ? 2 : 0))
  }, [])

  const screen: 'welcome' | 'close' | Sku = sku ?? (clip === 'close' ? 'close' : 'welcome')
  const hot = hotFields(sku, part, useLimits, clampNotes, sizeMarks)
  const posts = plinths()
  const approach = {
    j03: Math.hypot(feet.x - posts[0].x, feet.z - posts[0].z) <= 2,
    j02: Math.hypot(feet.x - posts[1].x, feet.z - posts[1].z) <= 2,
  }

  return (
    <div className={sku ? 'shell is-walk has-sheet' : 'shell is-walk'} aria-hidden={ready ? undefined : true}>
      <BrandBar lang={lang} onLang={setLang} />
      <main className="stage">
        <SceneBoundary>
          <Suspense fallback={null}>
            <Showroom
              zone={zone}
              sku={sku}
              lang={lang}
              part={part}
              sizeMarks={sizeMarks}
              clampNotes={clampNotes}
              pose={pose}
              rimOrbit={rimOrbit}
              screen={screen}
              onReady={markReady}
              onOpenSku={openObject}
              onGuide={onGuide}
              onPickPart={setPart}
              frameNonce={frameNonce}
              onRimOrbitDone={() => setRimOrbit(false)}
              mode={mode}
              spawn={spawn}
              padRef={pad}
              lightRoom={mode === 'closeup' ? 'B2' : room}
              approach={approach}
              onPose={onPose}
              onPickRoom={pickRoom}
            />
          </Suspense>
        </SceneBoundary>
        <div className="proxies">
          <button type="button" className="proxy" onClick={() => openObject('J03-01')}>
            J03-01
          </button>
          <button type="button" className="proxy" onClick={() => openObject('J02-01')}>
            J02-01
          </button>
        </div>
        <WalkChrome
          lang={lang}
          mode={mode}
          room={room}
          heading={heading}
          visited={visited}
          hintOn={hintOn}
          note={noteOn}
          padRef={pad}
          onDismissHint={() => setHintOn(false)}
          onOverview={goPlan}
          onBack={backToExhibit}
          onMinimap={goPlan}
        />
      </main>
      {sku ? (
        <CatalogSheet
          sku={sku}
          lang={lang}
          closeup={zone === 'closeup'}
          hot={hot}
          pose={pose}
          sizeMarks={sizeMarks}
          useLimits={useLimits}
          clampNotes={clampNotes}
          rimOrbit={rimOrbit}
          onOpenCloseup={openCloseup}
          onExitCloseup={exitCloseup}
          onRim={() => setRimOrbit(true)}
          onToggleSize={() => setSizeMarks((value) => !value)}
          onToggleUse={() => setUseLimits((value) => !value)}
          onCyclePose={cyclePose}
          onPose={setPose}
          onToggleClamp={() => setClampNotes((value) => !value)}
          onPickPart={setPart}
        />
      ) : null}
      <footer className="foot">
        {clip ? (
          <p className="subtitle" translate="no" aria-live="polite">
            {SUBTITLES[clip]}
          </p>
        ) : null}
        <Disclaimer />
      </footer>
    </div>
  )
}
