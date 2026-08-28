import { BrowserMultiFormatReader } from '@zxing/browser'
import { useRef, useState } from 'react'

export type ScannedTicket = {
  trackingCode?: string
  recipient?: string
  phone?: string
  city?: string
  address?: string
  price?: string
  importComment?: string
}

type TicketOcrScannerProps = {
  onDetected: (ticket: ScannedTicket) => void
  onClose: () => void
}

const labels = {
  recipient: ['destinataire', 'recipient', 'receiver', 'consignee', 'client', 'customer', 'nom', 'المستلم', 'الاسم'],
  phone: ['telephone', 'tel', 'phone', 'mobile', 'gsm', 'الهاتف', 'هاتف'],
  city: ['ville', 'city', 'localite', 'locality', 'المدينة', 'المدينه'],
  address: ['adresse', 'address', 'location', 'العنوان'],
  comment: ['commentaires', 'commentaire', 'comment', 'instructions', 'remarques', 'ملاحظات'],
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

function useful(value: string) {
  return value.replace(/[\u200E\u200F\u061C|_]/g, ' ').replace(/\s+/g, ' ').trim()
}

function valueForLabel(lines: string[], fieldLabels: string[], allowValueBeforeLabel = false) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = useful(lines[index])
    const normalizedLine = normalize(line)
    const label = fieldLabels.find((candidate) => normalizedLine.includes(normalize(candidate)))
    if (!label) continue
    const labelIndex = normalizedLine.indexOf(normalize(label))
    const after = useful(line.slice(labelIndex + label.length).replace(/^[\s:：,.;\-–]+/, ''))
    if (after) return after
    const before = useful(line.slice(0, labelIndex))
    if (allowValueBeforeLabel && before && /[\p{L}\p{N}]/u.test(before)) return before
    const nextLine = useful(lines[index + 1] ?? '')
    if (nextLine && !fieldLabels.some((candidate) => normalize(nextLine).includes(normalize(candidate)))) return nextLine
  }
  return ''
}

function pickTrackingCode(text: string) {
  const candidates = [...text.matchAll(/\b[A-Z0-9][A-Z0-9-]{8,}\b/gi)]
    .map((match) => match[0].toUpperCase())
    .filter((candidate) => /[A-Z]/.test(candidate) && /\d/.test(candidate))
  return candidates.sort((left, right) => right.length - left.length)[0] ?? ''
}

function extractTicket(text: string, qrText?: string): ScannedTicket {
  const lines = text.split(/\r?\n/).map(useful).filter(Boolean)
  const compact = text.replace(/\s+/g, ' ')
  const phoneText = valueForLabel(lines, labels.phone)
  const phone = phoneText.match(/(?:\+?212[\s.-]?)?(?:0[\s.-]?)?[5-7](?:[\s.-]?\d){8}/)?.[0]?.replace(/[\s.-]/g, '')
  const price = compact.match(/(?:crbt|cod|montant|amount|price|contre remboursement|المبلغ)?\s*[:.-]?\s*(\d+(?:[,.]\d{1,2})?)\s*(?:dh|dhs|mad|€|eur|\$|usd)\b/i)?.[1]?.replace(',', '.')
  return {
    trackingCode: pickTrackingCode(qrText ?? '') || pickTrackingCode(compact),
    recipient: valueForLabel(lines, labels.recipient),
    phone,
    city: valueForLabel(lines, labels.city),
    address: valueForLabel(lines, labels.address, true),
    price,
    importComment: valueForLabel(lines, labels.comment),
  }
}

async function readQr(file: File) {
  const url = URL.createObjectURL(file)
  try {
    return (await new BrowserMultiFormatReader().decodeFromImageUrl(url)).getText().trim()
  } catch {
    return ''
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function TicketOcrScanner({ onDetected, onClose }: TicketOcrScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('La lecture est locale et gratuite. Prenez une photo nette de toute l’étiquette.')

  async function scan(file?: File) {
    if (!file) return
    setBusy(true)
    setMessage('Lecture locale du QR et du texte en cours…')
    let worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | null = null
    try {
      const qrPromise = readQr(file)
      const { createWorker } = await import('tesseract.js')
      worker = await createWorker('fra+eng+ara')
      const result = await worker.recognize(file)
      const ticket = extractTicket(result.data.text, await qrPromise)
      if (!Object.values(ticket).some(Boolean)) {
        setMessage('Aucun champ lisible. Reprenez une photo bien éclairée, sans pli et avec le ticket entier.')
        return
      }
      onDetected(ticket)
    } catch {
      setMessage('Lecture impossible. Réessayez avec une image JPG ou PNG plus nette.')
    } finally {
      await worker?.terminate()
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return <div className="barcode-scanner" role="dialog" aria-modal="true" aria-label="Scanner une étiquette">
    <div className="barcode-scanner-panel ticket-ocr-panel">
      <div className="barcode-scanner-header"><div><p className="eyebrow">NOUVEAU COLIS</p><h2>Lire une étiquette</h2></div><button className="secondary-button" disabled={busy} onClick={onClose}>Fermer</button></div>
      <div className="ticket-ocr-content"><span aria-hidden="true">▣</span><p>Lecture locale QR et OCR en français, arabe et anglais. Vérifiez toujours les champs avant de créer le colis.</p><input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { void scan(event.target.files?.[0]) }} /><button className="primary-button" disabled={busy} onClick={() => { inputRef.current?.setAttribute('capture', 'environment'); inputRef.current?.click() }}>{busy ? 'Lecture en cours…' : 'Prendre une photo'}</button><button className="secondary-button" disabled={busy} onClick={() => { inputRef.current?.removeAttribute('capture'); inputRef.current?.click() }}>Choisir une image</button></div>
      <p className="scanner-message">{message}</p>
    </div>
  </div>
}
