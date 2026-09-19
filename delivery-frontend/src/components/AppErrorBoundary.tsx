import { Component, type ReactNode } from 'react'

/** Covers rejected lazy imports as well as render errors, without reload loops. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <main className="login-page"><section className="login-card" role="alert">
      <h1>Impossible d’afficher cet écran</h1>
      <p>Un fichier n’a pas pu être chargé ou une erreur est survenue. Vérifiez votre connexion puis rechargez l’application.</p>
      <p>Les saisies non enregistrées seront perdues lors du rechargement.</p>
      <button className="primary-button" onClick={() => window.location.reload()}>Recharger l’application</button>
    </section></main>
    return this.props.children
  }
}
