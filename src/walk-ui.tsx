import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { WALK_COPY } from './copy'
import type { Lang } from './copy'
import { NOTE_ROOMS, planBounds, plinths, rectOf, type RoomId } from './showroom/plan'
import { b2Center, b2Radius } from './showroom/plan'
import { StackedCopy } from './ui'

export function WalkChrome({
  lang,
  mode,
  room,
  heading,
  visited,
  hintOn,
  note,
  padRef,
  onDismissHint,
  onOverview,
  onBack,
  onMinimap,
}: {
  lang: Lang
  mode: 'walk' | 'plan' | 'closeup'
  room: RoomId
  heading: number
  visited: readonly RoomId[]
  hintOn: boolean
  note: boolean
  padRef: RefObject<{ x: number; z: number }>
  onDismissHint: () => void
  onOverview: () => void
  onBack: () => void
  onMinimap: () => void
}) {
  const coarse = useCoarse()
  const hint = coarse ? WALK_COPY.hint_mobile : WALK_COPY.hint_desktop
  return (
    <div className="walk-ui" translate="no">
      {hintOn && mode !== 'closeup' ? (
        <div className="walk-hint is-in">
          <p>
            <StackedCopy zh={hint.zh} en={hint.en} lang={lang} />
          </p>
          <button type="button" className="walk-dismiss" onClick={onDismissHint}>
            <StackedCopy zh={WALK_COPY.hint_dismiss.zh} en={WALK_COPY.hint_dismiss.en} lang={lang} />
          </button>
        </div>
      ) : null}
      {note ? (
        <div className="walk-note is-in">
          <StackedCopy zh={WALK_COPY.empty_note.zh} en={WALK_COPY.empty_note.en} lang={lang} />
        </div>
      ) : null}
      <div className="walk-actions">
        <button type="button" className="walk-action" onClick={onOverview}>
          <StackedCopy zh={WALK_COPY.overview.zh} en={WALK_COPY.overview.en} lang={lang} />
        </button>
        <button type="button" className="walk-action" onClick={onBack}>
          <StackedCopy zh={WALK_COPY.back_exhibit.zh} en={WALK_COPY.back_exhibit.en} lang={lang} />
        </button>
      </div>
      {coarse && mode === 'walk' ? <Joystick padRef={padRef} /> : null}
      <button
        type="button"
        className="minimap"
        onClick={onMinimap}
        aria-label={`${WALK_COPY.minimap_current.zh} ${WALK_COPY.minimap_current.en}`}
      >
        <Minimap room={room} heading={heading} visited={visited} />
      </button>
    </div>
  )
}

function Minimap({
  room,
  heading,
  visited,
}: {
  room: RoomId
  heading: number
  visited: readonly RoomId[]
}) {
  const bounds = planBounds()
  const w = bounds.maxX - bounds.minX
  const d = bounds.maxZ - bounds.minZ
  const pad = 0.6
  const vb = `${bounds.minX - pad} ${-(bounds.maxZ + pad)} ${w + pad * 2} ${d + pad * 2}`
  const posts = plinths()
  const title =
    room === 'B2'
      ? `${WALK_COPY.minimap_current.zh} / ${WALK_COPY.minimap_current.en}`
      : visited.includes(room)
        ? `${WALK_COPY.minimap_visited.zh} / ${WALK_COPY.minimap_visited.en}`
        : room
  return (
    <svg viewBox={vb} className="minimap-svg" role="img" aria-label={title}>
      {NOTE_ROOMS.concat(['B1']).map((id) => {
        const rect = rectOf(id as Exclude<RoomId, 'B2'>)
        const here = id === room
        const seen = visited.includes(id as RoomId)
        return (
          <rect
            key={id}
            x={rect.minX}
            y={-rect.maxZ}
            width={rect.maxX - rect.minX}
            height={rect.maxZ - rect.minZ}
            className={here ? 'mini-here' : seen ? 'mini-seen' : 'mini-new'}
          />
        )
      })}
      <circle cx={b2Center().x} cy={-b2Center().z} r={b2Radius()} className={room === 'B2' ? 'mini-here' : visited.includes('B2') ? 'mini-seen' : 'mini-new'} />
      {posts.map((post) => (
        <circle key={post.sku} cx={post.x} cy={-post.z} r={0.18} className="mini-mark" />
      ))}
      <g transform={`translate(${roomPoint(room).x} ${-roomPoint(room).z}) rotate(${(heading * 180) / Math.PI})`}>
        <polygon points="0,-0.55 0.32,0.4 -0.32,0.4" className="mini-arrow" />
      </g>
    </svg>
  )
}

function roomPoint(id: RoomId): { x: number; z: number } {
  if (id === 'B2') return b2Center()
  const rect = rectOf(id)
  return { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 }
}

function Joystick({ padRef }: { padRef: RefObject<{ x: number; z: number }> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let id = -1
    const point = (event: PointerEvent) => {
      const box = el.getBoundingClientRect()
      const dx = event.clientX - (box.left + box.width / 2)
      const dy = event.clientY - (box.top + box.height / 2)
      const max = box.width * 0.36
      const len = Math.hypot(dx, dy) || 1
      const scale = Math.min(1, max / len)
      const x = dx * scale
      const y = dy * scale
      setKnob({ x, y })
      if (padRef.current) {
        padRef.current.x = Math.max(-1, Math.min(1, x / max))
        padRef.current.z = Math.max(-1, Math.min(1, -y / max))
      }
    }
    const down = (event: PointerEvent) => {
      id = event.pointerId
      el.setPointerCapture(event.pointerId)
      point(event)
    }
    const end = () => {
      id = -1
      setKnob({ x: 0, y: 0 })
      if (padRef.current) {
        padRef.current.x = 0
        padRef.current.z = 0
      }
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== id) return
      point(event)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', end)
      el.removeEventListener('pointercancel', end)
    }
  }, [padRef])
  return (
    <div className="joystick" ref={ref}>
      <span className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

function useCoarse(): boolean {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1024px), (pointer: coarse)')
    const apply = () => setCoarse(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])
  return coarse
}
