import { useState, type FormEvent } from 'react'
import { login } from '../api/client'
import { saveAuth } from '../auth'

type LoginPageProps = { onLogin: () => void }

export function LoginPage({ onLogin }: LoginPageProps) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('')
    try { const result = await login(phone, password); saveAuth(result); onLogin() }
    catch { setError('Telephone ou mot de passe incorrect.') }
    finally { setLoading(false) }
  }
  return <main className="login-page"><form className="login-card" onSubmit={submit}><div className="brand login-brand"><span className="brand-mark">D</span><span>delivery<span className="brand-dot">.</span></span></div><h1>Connexion</h1><p>Accedez a votre espace de livraison.</p><label>Telephone<input required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0600000000" /></label><label>Mot de passe<div className="password-field"><input required type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Votre mot de passe" /><button type="button" className="password-visibility" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'Masquer' : 'Afficher'}</button></div></label>{error && <div className="login-error">{error}</div>}<button className="primary-button" disabled={loading}>{loading ? 'Connexion...' : 'Se connecter'}</button></form></main>
}
