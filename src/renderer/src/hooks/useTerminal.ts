import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'

/** Thème xterm accordé à la palette de l'application. */
/**
 * Thème du terminal, accordé au design system.
 *
 * Il en fait pleinement partie : c'est ici que la couleur vit réellement, et des
 * ANSI qui jurent avec l'interface ruinent l'ensemble. Les seize teintes sont
 * dérivées de la même palette que le reste, en versions normale et vive.
 */
const THEME = {
  background: '#000000',
  foreground: '#ece8e3',
  cursor: '#d97757',
  cursorAccent: '#000000',
  selectionBackground: '#2e2a26',
  black: '#1c1917',
  red: '#e0685f',
  green: '#94c47a',
  yellow: '#dfb45e',
  blue: '#7fa8d6',
  magenta: '#c093c9',
  cyan: '#6fbfae',
  white: '#d6cfc7',
  brightBlack: '#78706a',
  brightRed: '#ef8078',
  brightGreen: '#a9d491',
  brightYellow: '#eeca7c',
  brightBlue: '#9bbde3',
  brightMagenta: '#d3aad9',
  brightCyan: '#8ad2c2',
  brightWhite: '#f5f1ec'
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
  /** Vrai quand le terminal s'est arrêté : plus rien ne répond derrière. */
  arrete: boolean
  ecrire: (commande: string) => void
  oublierRestauration: () => void
  relancer: () => void
} {
  const conteneur = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const [demarre, setDemarre] = useState(false)
  const [aRestaurer, setARestaurer] = useState(false)
  const [arrete, setArrete] = useState(false)
  const [reprises, setReprises] = useState(0)

  useEffect(() => {
    const hote = conteneur.current
    if (!hote) return

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, ui-monospace, monospace",
      // La taille se laisse forcer, comme le rendu WebGL plus bas. Une
      // démonstration destinée à être regardée dans un README a besoin de
      // caractères deux fois plus gros que ceux du travail quotidien.
      fontSize: (window as unknown as { __claudexPolice?: number }).__claudexPolice ?? 12.5,
      lineHeight: 1.3,
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
      window.claudex.term.onExit((id) => {
        // Le client tmux s'est terminé : soit la session a été détruite, soit le
        // serveur lui-même s'est arrêté. Dans les deux cas plus rien n'écoute
        // derrière, et taper dans ce terminal ne produirait aucun effet.
        if (id === tabId && vivant) setArrete(true)
      })
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

    if (reprises > 0) {
      // Une relance repart d'un écran propre : l'ancien contenu appartient à une
      // session qui n'existe plus.
      terminal.reset()
      setArrete(false)
      setDemarre(false)
    }

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
  }, [tabId, reprises])

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
    arrete,
    ecrire,
    oublierRestauration: () => setARestaurer(false),
    // Remonter le terminal en entier : la session tmux est recréée au passage,
    // et le nouvel écran ne garde rien de l'ancien.
    relancer: () => setReprises((n) => n + 1)
  }
}
