import { BarcodeFormat, BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { useEffect, useRef, useState } from 'react'

type BarcodeScannerProps = {
  onDetected: (trackingCode: string) => void
  onClose: () => void
}

// These are the formats carried by the shipping labels accepted by the
// workspace. Restricting the decoder avoids spending time trying formats that
// cannot identify a parcel (Aztec, PDF417, MaxiCode, ...).
const shipmentFormats = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.ITF,
]

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
    // ZXing normally waits 500 ms between frames. 125 ms keeps the scanner
    // responsive while leaving enough time for mid-range delivery phones.
    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 125,
      delayBetweenScanSuccess: 125,
    })
    reader.possibleFormats = shipmentFormats
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
              // 720p is much faster to decode than 1080p and remains more
              // than sufficient for a QR or shipping barcode in the frame.
              width: { ideal: 1280 },
              height: { ideal: 720 },
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
