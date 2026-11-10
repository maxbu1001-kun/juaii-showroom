import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { armGuideAudio, playClip, settleWelcome, tryWelcome, useActiveClip } from './audio'
import { CONTROLS, PARTS, SUBTITLES } from './copy'
import type { FieldKey, Lang, PartId, Sku, Zone } from './copy'
import { BrandBar, CatalogSheet, Disclaimer, StackedCopy, ZoneNav } from './ui'

const Showroom = lazy(() => import('./showroom/Showroom'))

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
  const [returnZone, setReturnZone] = useState<Exclude<Zone, 'closeup'>>('overview')
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

  const goZone = useCallback(
    (next: Exclude<Zone, 'closeup'>) => {
      clearStudy()
      setZone(next)
      setReturnZone(next)
      bumpFrame()
    },
    [clearStudy, bumpFrame],
  )

  const openCloseup = useCallback(() => {
    if (!skuRef.current) return
    const current = zoneRef.current
    if (current !== 'closeup') {
      setReturnZone(current)
    }
    setZone('closeup')
    bumpFrame()
  }, [bumpFrame])

  const exitCloseup = useCallback(() => {
    clearStudy()
    setZone(returnZone)
    bumpFrame()
  }, [clearStudy, returnZone, bumpFrame])

  const collapseFocus = useCallback(() => {
    const current = zoneRef.current
    clearStudy()
    setSku(null)
    if (current === 'closeup') setZone(returnZone)
    void playClip('close').catch(() => {})
  }, [clearStudy, returnZone])

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
      const currentZone = zoneRef.current
      if (prev !== id) clearStudy()
      setSku(id)
      if (prev && prev !== id) {
        if (currentZone === 'closeup') {
          bumpFrame()
        } else if (currentZone === 'j03' && id === 'J02-01') {
          setZone('j02')
          setReturnZone('j02')
          bumpFrame()
        } else if (currentZone === 'j02' && id === 'J03-01') {
          setZone('j03')
          setReturnZone('j03')
          bumpFrame()
        }
      }
      settleWelcome()
      void playClip(id).catch(() => {})
    },
    [clearStudy, bumpFrame],
  )

  const onGuide = useCallback(() => {
    if (zoneRef.current !== 'closeup') {
      setZone('guide')
      setReturnZone('guide')
    }
    const current = skuRef.current
    if (!current) return
    settleWelcome()
    void playClip(current).catch(() => {})
  }, [])

  const cyclePose = useCallback(() => {
    setPose((current) => (current === 0 ? 1 : current === 1 ? 2 : 0))
  }, [])

  const screen: 'welcome' | 'close' | Sku = sku ?? (clip === 'close' ? 'close' : 'welcome')
  const hot = hotFields(sku, part, useLimits, clampNotes, sizeMarks)

  return (
    <div className={sku ? 'shell has-sheet' : 'shell'} aria-hidden={ready ? undefined : true}>
      <BrandBar lang={lang} onLang={setLang} />
      <ZoneNav zone={zone} lang={lang} sku={sku} onZone={goZone} onCloseup={openCloseup} />
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
          <button type="button" className="proxy" onClick={onGuide}>
            <StackedCopy zh={CONTROLS.jump_guide.zh} en={CONTROLS.jump_guide.en} lang={lang} />
          </button>
        </div>
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
