let scanAudioContext: AudioContext | null = null

function playTone(context: AudioContext) {
  const startAt = context.currentTime
  const notes = [880, 1175]
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const noteStart = startAt + index * 0.09
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, noteStart)
    gain.gain.setValueAtTime(0.0001, noteStart)
    gain.gain.exponentialRampToValueAtTime(0.16, noteStart + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.12)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(noteStart)
    oscillator.stop(noteStart + 0.13)
  })
}

export function playValidatedScanSound() {
  try {
    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextConstructor) return
    scanAudioContext ??= new AudioContextConstructor()
    if (scanAudioContext.state === 'suspended') {
      void scanAudioContext.resume().then(() => playTone(scanAudioContext!))
    } else {
      playTone(scanAudioContext)
    }
    navigator.vibrate?.(60)
  } catch {
    // Audio feedback is optional; a browser restriction must never block a scan.
  }
}
