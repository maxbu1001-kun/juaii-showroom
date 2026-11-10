import { CanvasTexture, LinearFilter, RepeatWrapping, SRGBColorSpace } from 'three'
import { CATALOG, CLOSE, DISCLAIMER, FIELD_ORDER, SUBTITLES, WELCOME } from '../copy'
import type { FieldKey, Lang, Pair, Sku } from '../copy'

export type PanelImage = {
  texture: CanvasTexture
  aspect: number
}

type Run = {
  text: string
  size: number
  weight: 400 | 500
  color: string
  gap: number
}

const INK = '#2f2d2b'
const MUTED = '#6a655f'
const QUIET = '#5e5a55'
const PAPER = '#e8e5e0'

let brushed: CanvasTexture | null = null

export function getBrushedMap(): CanvasTexture {
  if (brushed) return brushed
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.fillStyle = '#d5d8dc'
  ctx.fillRect(0, 0, 64, 64)
  for (let y = 0; y < 64; y += 1) {
    const tone = 188 + ((y * 13) % 48)
    ctx.fillStyle = `rgb(${tone}, ${tone + 1}, ${tone + 3})`
    ctx.fillRect(0, y, 64, 1)
  }
  ctx.globalAlpha = 0.35
  for (let i = 0; i < 10; i += 1) {
    ctx.strokeStyle = i % 2 === 0 ? '#ffffff' : '#8e949b'
    ctx.beginPath()
    ctx.moveTo(0, i * 6 + 1)
    ctx.lineTo(64, i * 6)
    ctx.stroke()
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(5, 1.4)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  brushed = texture
  return texture
}

function font(size: number, weight: 400 | 500): string {
  return `${weight} ${size}px "IBM Plex Sans", "Noto Sans SC", sans-serif`
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  const tokens = text.split(/(\s+)/)
  for (const token of tokens) {
    if (!token) continue
    const next = line + token
    if (ctx.measureText(next).width <= maxWidth) {
      line = next
      continue
    }
    if (line.trim()) lines.push(line.trimEnd())
    if (ctx.measureText(token).width <= maxWidth) {
      line = token.trimStart()
      continue
    }
    let chunk = ''
    for (const ch of Array.from(token)) {
      const trial = chunk + ch
      if (ctx.measureText(trial).width > maxWidth && chunk) {
        lines.push(chunk)
        chunk = ch
      } else {
        chunk = trial
      }
    }
    line = chunk
  }
  if (line.trim()) lines.push(line.trimEnd())
  return lines.length > 0 ? lines : ['']
}

function paint(runs: readonly Run[], scale: number, width: number): HTMLCanvasElement {
  const pad = Math.round(36 * scale)
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) throw new Error('canvas')
  const laid: { text: string; size: number; weight: 400 | 500; color: string; gap: number }[] = []
  let height = pad
  for (const run of runs) {
    const size = Math.max(8, Math.round(run.size * scale))
    probe.font = font(size, run.weight)
    const lines = wrap(probe, run.text, width - pad * 2)
    const gap = Math.round(run.gap * scale)
    lines.forEach((text, index) => {
      laid.push({
        text,
        size,
        weight: run.weight,
        color: run.color,
        gap: index === lines.length - 1 ? gap : Math.round(size * 0.28),
      })
      height += Math.round(size * 1.38) + (index === lines.length - 1 ? gap : Math.round(size * 0.28))
    })
  }
  height += pad
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.max(height, 64)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  let y = pad
  for (const line of laid) {
    ctx.font = font(line.size, line.weight)
    ctx.fillStyle = line.color
    ctx.textBaseline = 'top'
    ctx.fillText(line.text, pad, y)
    y += Math.round(line.size * 1.38) + line.gap
  }
  return canvas
}

function toTexture(canvas: HTMLCanvasElement): PanelImage {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return { texture, aspect: canvas.width / canvas.height }
}

function fit(runs: readonly Run[], width: number, maxHeight: number): PanelImage {
  let scale = 1
  let canvas = paint(runs, scale, width)
  let guard = 0
  while (canvas.height > maxHeight && scale > 0.42 && guard < 4) {
    scale *= maxHeight / canvas.height
    canvas = paint(runs, scale, width)
    guard += 1
  }
  return toTexture(canvas)
}

function fieldRuns(sku: Sku, lang: Lang): Run[] {
  const runs: Run[] = []
  for (const key of FIELD_ORDER) {
    const field = CATALOG[sku][key]
    pushPair(runs, field.label, field.value, lang)
  }
  return runs
}

function pushPair(runs: Run[], label: Pair, value: Pair, lang: Lang): void {
  if (lang !== 'en') {
    runs.push({ text: label.zh, size: 18, weight: 500, color: QUIET, gap: 4 })
    runs.push({ text: value.zh, size: 24, weight: 500, color: INK, gap: 12 })
  }
  if (lang !== 'zh') {
    runs.push({ text: label.en, size: 15, weight: 400, color: QUIET, gap: 4 })
    runs.push({ text: value.en, size: 18, weight: 400, color: MUTED, gap: 18 })
  }
}

export function makeFactPanel(sku: Sku, lang: Lang): PanelImage {
  return fit(fieldRuns(sku, lang), 720, 1280)
}

export function makeScreenPanel(mode: 'welcome' | 'close' | Sku, lang: Lang): PanelImage {
  const runs: Run[] = []
  if (mode === 'welcome') {
    runs.push({ text: WELCOME, size: 26, weight: 400, color: INK, gap: 20 })
  } else if (mode === 'close') {
    runs.push({ text: CLOSE, size: 26, weight: 400, color: INK, gap: 20 })
  } else {
    runs.push({ text: SUBTITLES[mode], size: 20, weight: 400, color: INK, gap: 22 })
    runs.push(...fieldRuns(mode, lang))
  }
  runs.push({ text: DISCLAIMER.zh, size: 16, weight: 400, color: MUTED, gap: 4 })
  runs.push({ text: DISCLAIMER.en, size: 14, weight: 400, color: QUIET, gap: 0 })
  return fit(runs, 720, mode === 'welcome' || mode === 'close' ? 900 : 1500)
}

export function makeNote(zh: string | undefined, en: string | undefined): PanelImage {
  const runs: Run[] = []
  if (zh) runs.push({ text: zh, size: 28, weight: 500, color: INK, gap: 10 })
  if (en) runs.push({ text: en, size: 22, weight: 400, color: QUIET, gap: 0 })
  return fit(runs, 900, 420)
}

export function makeMicroLabel(label: Pair, lang: Lang): PanelImage {
  const runs: Run[] = []
  if (lang !== 'en') runs.push({ text: label.zh, size: 32, weight: 500, color: INK, gap: 6 })
  if (lang !== 'zh') runs.push({ text: label.en, size: 24, weight: 400, color: QUIET, gap: 0 })
  return fit(runs, 420, 180)
}

export function noteLines(key: FieldKey, sku: Sku, lang: Lang): { zh?: string; en?: string } {
  const value = CATALOG[sku][key].value
  return {
    zh: lang === 'en' ? undefined : value.zh,
    en: lang === 'zh' ? undefined : value.en,
  }
}
