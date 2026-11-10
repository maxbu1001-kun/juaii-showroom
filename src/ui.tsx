import { useEffect, useRef } from 'react'
import {
  BRAND_LINE,
  CATALOG,
  CONTROLS,
  DISCLAIMER,
  FIELD_ORDER,
  LANG_OPTIONS,
  PARTS,
  POSE_LABELS,
  ZONE_BUTTONS,
} from './copy'
import type { FieldKey, Lang, PartId, Sku, Zone } from './copy'

export function StackedCopy({
  zh,
  en,
  lang,
}: {
  zh: string
  en: string
  lang: Lang
}) {
  return (
    <>
      {lang !== 'en' ? <span className="ctrl-zh">{zh}</span> : null}
      {lang !== 'zh' ? <span className="ctrl-en">{en}</span> : null}
    </>
  )
}

function CopyButton({
  zh,
  en,
  lang,
  pressed,
  onClick,
  className,
}: {
  zh: string
  en: string
  lang: Lang
  pressed?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={className}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <StackedCopy zh={zh} en={en} lang={lang} />
    </button>
  )
}

export function Disclaimer() {
  return (
    <p className="disclaimer" translate="no">
      <span className="d-zh">{DISCLAIMER.zh}</span>
      <span className="d-en">{DISCLAIMER.en}</span>
    </p>
  )
}

export function BrandBar({ lang, onLang }: { lang: Lang; onLang: (lang: Lang) => void }) {
  return (
    <header className="brand">
      <div>
        <h1 className="mark">JUΛII</h1>
        <p className="brand-line" translate="no">
          {BRAND_LINE}
        </p>
      </div>
      <div className="langs" role="group" aria-label="仅中文 仅英文 中英并列">
        {LANG_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={lang === option.id ? 'lang is-on' : 'lang'}
            aria-pressed={lang === option.id}
            onClick={() => onLang(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </header>
  )
}

export function ZoneNav({
  zone,
  lang,
  sku,
  onZone,
  onCloseup,
}: {
  zone: Zone
  lang: Lang
  sku: Sku | null
  onZone: (zone: Exclude<Zone, 'closeup'>) => void
  onCloseup: () => void
}) {
  return (
    <nav className="nav">
      {ZONE_BUTTONS.map((item) => {
        if (item.id === 'closeup' && !sku) return null
        const pressed = zone === item.id
        const narrow = 'narrow' in item ? item.narrow : undefined
        return (
          <button
            key={item.id}
            type="button"
            className={
              narrow
                ? pressed
                  ? 'zone-btn is-pedestal is-on'
                  : 'zone-btn is-pedestal'
                : pressed
                  ? 'zone-btn is-on'
                  : 'zone-btn'
            }
            aria-pressed={pressed}
            onClick={() => {
              if (item.id === 'closeup') onCloseup()
              else onZone(item.id)
            }}
          >
            {narrow ? <span className="zone-narrow">{narrow}</span> : null}
            <span className="zone-full">
              <StackedCopy zh={item.label.zh} en={item.label.en} lang={lang} />
            </span>
          </button>
        )
      })}
    </nav>
  )
}

export function CatalogSheet({
  sku,
  lang,
  closeup,
  hot,
  pose,
  sizeMarks,
  useLimits,
  clampNotes,
  rimOrbit,
  onOpenCloseup,
  onExitCloseup,
  onRim,
  onToggleSize,
  onToggleUse,
  onCyclePose,
  onPose,
  onToggleClamp,
  onPickPart,
}: {
  sku: Sku
  lang: Lang
  closeup: boolean
  hot: readonly FieldKey[]
  pose: 0 | 1 | 2
  sizeMarks: boolean
  useLimits: boolean
  clampNotes: boolean
  rimOrbit: boolean
  onOpenCloseup: () => void
  onExitCloseup: () => void
  onRim: () => void
  onToggleSize: () => void
  onToggleUse: () => void
  onCyclePose: () => void
  onPose: (pose: 0 | 1 | 2) => void
  onToggleClamp: () => void
  onPickPart: (part: PartId) => void
}) {
  const ref = useRef<HTMLElement>(null)
  const hotKey = hot.join('|')
  useEffect(() => {
    const first = hotKey.split('|')[0]
    if (!first || !ref.current) return
    const el = ref.current.querySelector(`[data-field="${first}"]`)
    if (!(el instanceof HTMLElement)) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [hotKey, sku, closeup])

  const hotSet = new Set(hot)
  return (
    <aside className="sheet" ref={ref} translate="no">
      {closeup ? <Disclaimer /> : null}
      <div className="sheet-controls">
        {closeup ? (
          <CopyButton
            className="copy-btn"
            zh={CONTROLS.exit_closeup.zh}
            en={CONTROLS.exit_closeup.en}
            lang={lang}
            onClick={onExitCloseup}
          />
        ) : (
          <CopyButton
            className="copy-btn"
            zh={CONTROLS.open_closeup.zh}
            en={CONTROLS.open_closeup.en}
            lang={lang}
            onClick={onOpenCloseup}
          />
        )}
        {closeup && sku === 'J03-01' ? (
          <>
            <CopyButton
              className="copy-btn"
              zh={CONTROLS.orbit_rim.zh}
              en={CONTROLS.orbit_rim.en}
              lang={lang}
              pressed={rimOrbit}
              onClick={onRim}
            />
            <CopyButton
              className="copy-btn"
              zh={sizeMarks ? CONTROLS.dim_hide.zh : CONTROLS.dim_show.zh}
              en={sizeMarks ? CONTROLS.dim_hide.en : CONTROLS.dim_show.en}
              lang={lang}
              pressed={sizeMarks}
              onClick={onToggleSize}
            />
            <CopyButton
              className="copy-btn"
              zh={CONTROLS.read_use_limits.zh}
              en={CONTROLS.read_use_limits.en}
              lang={lang}
              pressed={useLimits}
              onClick={onToggleUse}
            />
          </>
        ) : null}
        {closeup && sku === 'J02-01' ? (
          <>
            <CopyButton
              className="copy-btn"
              zh={CONTROLS.angle_indicative.zh}
              en={CONTROLS.angle_indicative.en}
              lang={lang}
              onClick={onCyclePose}
            />
            {POSE_LABELS.map((label, index) => {
              const id = index === 0 ? 0 : index === 1 ? 1 : 2
              return (
                <CopyButton
                  key={label.zh}
                  className="copy-btn"
                  zh={label.zh}
                  en={label.en}
                  lang={lang}
                  pressed={pose === id}
                  onClick={() => onPose(id)}
                />
              )
            })}
            <CopyButton
              className="copy-btn"
              zh={CONTROLS.clamp_notes.zh}
              en={CONTROLS.clamp_notes.en}
              lang={lang}
              pressed={clampNotes}
              onClick={onToggleClamp}
            />
            <CopyButton
              className="copy-btn"
              zh={CONTROLS.read_use_limits.zh}
              en={CONTROLS.read_use_limits.en}
              lang={lang}
              pressed={useLimits}
              onClick={onToggleUse}
            />
          </>
        ) : null}
      </div>
      {FIELD_ORDER.map((key) => {
        const field = CATALOG[sku][key]
        const hotClass = hotSet.has(key) ? 'field is-hot' : 'field'
        if (key === 'sku_id') {
          return (
            <div key={key} className={hotClass} data-field={key}>
              <div className="field-block">
                <p className="field-label zh">{field.label.zh}</p>
                <p className="field-value zh">{field.value.zh}</p>
              </div>
            </div>
          )
        }
        return (
          <div key={key} className={hotClass} data-field={key}>
            {lang !== 'en' ? (
              <div className="field-block">
                <p className="field-label zh">{field.label.zh}</p>
                <p className="field-value zh">{field.value.zh}</p>
              </div>
            ) : null}
            {lang !== 'zh' ? (
              <div className="field-block">
                <p className="field-label en">{field.label.en}</p>
                <p className="field-value en">{field.value.en}</p>
              </div>
            ) : null}
          </div>
        )
      })}
      {closeup
        ? (Object.keys(PARTS) as PartId[])
            .filter((id) => PARTS[id].sku === sku)
            .map((id) => (
              <button
                key={id}
                type="button"
                className="proxy"
                onClick={() => onPickPart(id)}
              >
                <StackedCopy zh={PARTS[id].label.zh} en={PARTS[id].label.en} lang={lang} />
              </button>
            ))
        : null}
    </aside>
  )
}
