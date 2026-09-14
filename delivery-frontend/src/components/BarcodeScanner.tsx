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
  const onDetectedRef = useRef(onDetected)
  const [message, setMessage] = useState('Demarrage de la camera...')

  // The driver's workspace refreshes in the background. Keeping the latest
  // callback in a ref prevents those refreshes from stopping and reopening
  // the camera while a code is being framed.
  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    let active = true

    async function start() {
      if (!videoRef.current) return
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage('La camera requiert un navigateur compatible et une connexion HTTPS.')
        return
      }
      try {
        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          },
          videoRef.current,
          (result) => {
            if (!active || !result || detectedRef.current) return
            const code = result.getText().trim()
            if (!code) return
            detectedRef.current = true
            controlsRef.current?.stop()
            onDetectedRef.current(code)
          },
        )
        // `decodeFromConstraints` may finish after the modal has been closed.
        // Stop that late stream explicitly so reopening the scanner does not
        // fail with a camera-already-in-use error.
        if (!active) {
          controls.stop()
          return
        }
        controlsRef.current = controls
        setMessage('Placez le QR code ou le code-barres dans le cadre.')
      } catch (error) {
        if (!active) return
        const name = error instanceof DOMException ? error.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setMessage('Accès à la caméra refusé. Autorisez-la dans le navigateur puis réessayez.')
        } else if (name === 'NotReadableError') {
          setMessage('La caméra est déjà utilisée par une autre application. Fermez-la puis réessayez.')
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setMessage('Aucune caméra compatible n’a été trouvée sur cet appareil.')
        } else {
          setMessage("Impossible d'ouvrir la caméra. Vérifiez l'autorisation puis réessayez.")
        }
      }
    }

    void start()
    return () => {
      active = false
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [])

  return <div className="barcode-scanner" role="dialog" aria-modal="true" aria-label="Scanner un QR code ou code-barres">
    <div className="barcode-scanner-panel">
      <div className="barcode-scanner-header"><div><p className="eyebrow">SCANNER CAMERA</p><h2>Lire un QR code ou code-barres</h2></div><button className="secondary-button" onClick={onClose}>Fermer</button></div>
      <div className="camera-frame"><video ref={videoRef} muted playsInline /></div>
      <p className="scanner-message">{message}</p>
    </div>
  </div>
}
