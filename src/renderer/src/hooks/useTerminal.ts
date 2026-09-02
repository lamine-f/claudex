import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'

/** Thème xterm accordé à la palette de l'application. */
const THEME = {
  background: '#0d0e12',
  foreground: '#e6e7ea',
  cursor: '#e8825a',
  cursorAccent: '#0d0e12',
  selectionBackground: '#2f323c',
  black: '#22242c',
  red: '#e05a5a',
  green: '#7ec96f',
  yellow: '#e0c15a',
  blue: '#5aa9e8',
  magenta: '#c98fe0',
  cyan: '#5ad0c0',
  white: '#c9ccd4',
  brightBlack: '#6b6e7b',
  brightRed: '#f07a7a',
  brightGreen: '#9adb8d',
  brightYellow: '#f0d67e',
  brightBlue: '#7cc0f5',
  brightMagenta: '#dcaaef',
  brightCyan: '#7ee0d3',
  brightWhite: '#f2f3f5'
}

/**
 * Monte un terminal xterm et l'attache à la session tmux de l'onglet.
 *
 * Le démontage se contente de détacher : la session tmux — et tout ce qui y tourne —
 * survit à la fermeture de l'onglet à l'écran comme à celle de l'application.
 */
export function useTerminal(
  tabId: string,
  actif: boolean
): {
  conteneur: React.RefObject<HTMLDivElement | null>
  demarre: boolean
  /** Vrai quand la session a dû être recréée : il y a quelque chose à reprendre. */
  aRestaurer: boolean
  ecrire: (commande: string) => void
  oublierRestauration: () => void
} {
  const conteneur = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const [demarre, setDemarre] = useState(false)
  const [aRestaurer, setARestaurer] = useState(false)

  useEffect(() => {
    const hote = conteneur.current
    if (!hote) return

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, ui-monospace, monospace",
      fontSize: 12.5,
      lineHeight: 1.25,
      letterSpacing: 0,
      scrollback: 0, // l'historique est tenu par tmux, pas par xterm
      theme: THEME,
      // Option ne doit pas être détournée en Meta : sur un clavier français,
      // c'est elle qui produit | \\ [ ] { }, indispensables au quotidien.
      macOptionIsMeta: false,
      macOptionClickForcesSelection: true
    })

    terminalRef.current = terminal

    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.loadAddon(new SearchAddon())
    terminal.loadAddon(new WebLinksAddon())
    terminal.open(hote)

    // Le rendu WebGL est un confort, pas une nécessité : en cas d'échec (pilote,
    // machine virtuelle), le rendu canvas par défaut prend le relais.
    //
    // Il peut aussi être écarté délibérément : une capture d'écran ne restitue
    // pas un canvas WebGL, et le terminal en ressortirait vide.
    const sansWebgl = (window as unknown as { __claudexSansWebgl?: boolean }).__claudexSansWebgl
    if (!sansWebgl) {
      void import('@xterm/addon-webgl')
        .then(({ WebglAddon }) => terminal.loadAddon(new WebglAddon()))
        .catch(() => undefined)
    }

    let vivant = true
    fit.fit()

    // Surface d'inspection : le rendu WebGL peint sur canvas et n'expose rien dans
    // le DOM. Sans ce registre, ni les tests de bout en bout ni la console ne
    // peuvent vérifier ce que le terminal a réellement reçu. Le renderer étant
    // sandboxé et purement local, l'exposer ne donne accès à rien de plus que ce
    // que l'application affiche déjà.
    const registre = ((window as unknown as Record<string, unknown>).__claudex ??= {}) as Record<
      string,
      unknown
    >
    registre[tabId] = terminal

    const desabonnements: Array<() => void> = []

    desabonnements.push(
      terminal.onData((donnees) => window.claudex.term.input(tabId, donnees)).dispose
    )
    desabonnements.push(
      window.claudex.term.onData((id, donnees) => {
        if (id !== tabId || !vivant) return
        terminal.write(donnees)
        // Première sortie reçue : le shell parle, on peut lui écrire.
        setDemarre(true)
      })
    )

    // tmux impose la taille du pane au client attaché : c'est xterm qui doit suivre
    // la fenêtre, et le pty qui transmet la nouvelle taille à tmux.
    //
    // Le recalcul est reporté à la frame suivante et n'émet que si la grille a
    // réellement changé : `fit()` redimensionne le contenu observé, ce qui
    // relancerait l'observateur en boucle si on le rappelait de façon synchrone.
    let frame = 0
    let dernieresDimensions = ''
    const observateur = new ResizeObserver(() => {
      if (!vivant || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (!vivant) return
        try {
          fit.fit()
          const dimensions = `${terminal.cols}x${terminal.rows}`
          if (dimensions === dernieresDimensions) return
          dernieresDimensions = dimensions
          window.claudex.term.resize(tabId, terminal.cols, terminal.rows)
        } catch {
          /* conteneur temporairement sans dimensions */
        }
      })
    })
    observateur.observe(hote)

    void window.claudex.term.open(tabId, terminal.cols, terminal.rows).then((resultat) => {
      if (!vivant) return
      // La session recréée a réaffiché l'écran d'avant elle-même ; il ne reste
      // qu'à proposer de reprendre ce qui y tournait.
      if (resultat.aRestaurer) setARestaurer(true)
      terminal.focus()
    })

    return () => {
      vivant = false
      terminalRef.current = null
      delete ((window as unknown as Record<string, Record<string, unknown>>).__claudex ?? {})[tabId]
      if (frame) cancelAnimationFrame(frame)
      observateur.disconnect()
      for (const desabonner of desabonnements) desabonner()
      void window.claudex.term.detach(tabId)
      terminal.dispose()
    }
  }, [tabId])

  // Reprendre le focus quand l'onglet redevient actif : sans cela, revenir sur un
  // terminal ne rend pas la main au clavier et l'on croit l'application figée.
  useEffect(() => {
    if (actif) terminalRef.current?.focus()
  }, [actif])

  const ecrire = (commande: string): void => {
    window.claudex.term.input(tabId, `${commande}\n`)
    setARestaurer(false)
    terminalRef.current?.focus()
  }

  return {
    conteneur,
    demarre,
    aRestaurer,
    ecrire,
    oublierRestauration: () => setARestaurer(false)
  }
}
