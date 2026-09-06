import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FenetreJournal } from './components/services/FenetreJournal'
import '@xterm/xterm/css/xterm.css'
import './styles/theme.css'

/**
 * Ce que la fenêtre doit montrer.
 *
 * Une fenêtre de journal charge le même renderer avec un fragment qui la
 * désigne. Rien à empaqueter en plus, et le thème comme le terminal sont ceux
 * de l'application.
 */
function racine(): React.JSX.Element {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const journal = fragment.get('journal')
  if (journal) return <FenetreJournal chemin={journal} titre={fragment.get('titre') ?? journal} />
  return <App />
}

createRoot(document.getElementById('root')!).render(<StrictMode>{racine()}</StrictMode>)
