import { useSyncExternalStore } from 'react'
import type { ClipId } from './copy'

const FILES: Record<ClipId, string> = {
  welcome: 'audio/welcome.mp3',
  'J03-01': 'audio/J03-01.mp3',
  'J02-01': 'audio/J02-01.mp3',
  close: 'audio/close.mp3',
}

let current: HTMLAudioElement | null = null
let clip: ClipId | null = null
let token = 0
let welcomeSettled = false
let leaveArmed = false
let lastCloseAt = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function getClip(): ClipId | null {
  return clip
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useActiveClip(): ClipId | null {
  return useSyncExternalStore(subscribe, getClip, getClip)
}

function stopCurrent(): void {
  if (!current) return
  current.onended = null
  current.pause()
  current.removeAttribute('src')
  current.load()
  current = null
}

export function settleWelcome(): void {
  welcomeSettled = true
}

export function playClip(id: ClipId): Promise<void> {
  const my = ++token
  stopCurrent()
  const audio = new Audio(`${import.meta.env.BASE_URL}${FILES[id]}`)
  audio.preload = 'auto'
  current = audio
  clip = id
  emit()
  if (id === 'welcome') welcomeSettled = true
  return audio.play().then(
    () => {
      if (my !== token) return
      if (id === 'welcome') welcomeSettled = true
    },
    (error: unknown) => {
      if (my !== token) return
      if (id === 'welcome') welcomeSettled = false
      throw error
    },
  )
}

function playCloseFromLeave(): void {
  if (!leaveArmed) return
  const now = Date.now()
  if (clip === 'close' && now - lastCloseAt < 800) return
  lastCloseAt = now
  void playClip('close').catch(() => {})
}

export function armGuideAudio(): void {
  if (leaveArmed) return
  leaveArmed = true
  window.addEventListener('pagehide', playCloseFromLeave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') playCloseFromLeave()
  })
}

export function tryWelcome(): void {
  if (welcomeSettled) return
  void playClip('welcome').catch(() => {
    const onUp = () => {
      if (welcomeSettled) return
      const now = getClip()
      if (now === 'J03-01' || now === 'J02-01' || now === 'close') {
        settleWelcome()
        return
      }
      void playClip('welcome').catch(() => {})
    }
    window.addEventListener('pointerup', onUp, { once: true })
  })
}
