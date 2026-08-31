import { useRef, useState } from 'react'
import { uploadExcel } from '../api/client'

type ExcelImportButtonProps = { onImported: () => Promise<void> }

export function ExcelImportButton({ onImported }: ExcelImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setMessage('')
    try {
      const result = await uploadExcel(file)
      await onImported()
      setMessage(`${result.imported} importe(s), ${result.skipped} ignore(s)`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import impossible')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return <div className="import-action"><input ref={inputRef} type="file" accept=".xlsx,.xls,.pdf,application/pdf" hidden onChange={(event) => handleFile(event.target.files?.[0])} /><button className="primary-button" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? 'Import en cours...' : 'Importer Excel ou PDF'}</button>{message && <span className="import-message">{message}</span>}</div>
}
