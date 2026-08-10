import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { useEffect, useRef, useState } from 'react'

type BarcodeScannerProps = {
  onDetected: (trackingCode: string) => void
  onClose: () => void
}

export function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const detectedRef = useRef(false)
  const [message, setMessage] = useState('Demarrage de la camera...')

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    let active = true

    async function start() {
      if (!videoRef.current) return
      try {
        controlsRef.current = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          videoRef.current,
          (result) => {
            if (!active || !result || detectedRef.current) return
            detectedRef.current = true
            controlsRef.current?.stop()
            onDetected(result.getText().trim())
          },
        )
        if (active) setMessage('Placez le code-barres dans le cadre.')
      } catch {
        if (active) setMessage("Impossible d'ouvrir la camera. Autorisez-la puis reessayez.")
      }
    }

    void start()
    return () => {
      active = false
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [onDetected])

  return <div className="barcode-scanner" role="dialog" aria-modal="true" aria-label="Scanner un code-barres">
    <div className="barcode-scanner-panel">
      <div className="barcode-scanner-header"><div><p className="eyebrow">SCANNER CAMERA</p><h2>Lire le code-barres</h2></div><button className="secondary-button" onClick={onClose}>Fermer</button></div>
      <div className="camera-frame"><video ref={videoRef} muted playsInline /></div>
      <p className="scanner-message">{message}</p>
    </div>
  </div>
}
