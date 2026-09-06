import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Terminal } from '@xterm/xterm'
import { THEME } from '@renderer/theme-terminal'

/**
 * Le journal d'un service, suivi dans sa propre fenêtre.
 *
 * Elle lit le fichier plutôt que de s'attacher à la session, et c'est ce qui la
 * rend possible : Claudex attache avec `attach-session -d`, qui détache les
 * autres clients, et sans le `-d` deux clients partagent la taille du pane, le
 * plus petit imposant la sienne. En lisant, on peut ouvrir autant de fenêtres
 * qu'on veut, chacune à sa taille, et sur les trois systèmes de la même façon.
 *
 * C'est aussi le fichier que lit l'agent. Une seule source, plusieurs lecteurs.
 */
export function FenetreJournal({
  chemin,
  titre
}: {
  chemin: string
  titre: string
}): React.JSX.Element {
  const hote = useRef<HTMLDivElement | null>(null)
  const [suit, setSuit] = useState(true)
  const [taille, setTaille] = useState(0)
  const suitRef = useRef(true)
  suitRef.current = suit

  useEffect(() => {
    const conteneur = hote.current
    if (!conteneur) return

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: false,
      disableStdin: true,
      fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, ui-monospace, monospace",
      fontSize: 12.5,
      lineHeight: 1.3,
      scrollback: 50_000,
      theme: THEME
    })
    const ajuster = new FitAddon()
    terminal.loadAddon(ajuster)
    terminal.loadAddon(new SearchAddon())
    terminal.open(conteneur)
    ajuster.fit()

    const surRedimension = new ResizeObserver(() => ajuster.fit())
    surRedimension.observe(conteneur)

    // Remonter dans l'historique gèle le suivi : sans cela, la moindre ligne
    // neuve ramènerait l'œil en bas au milieu de la lecture.
    const arretDefilement = terminal.onScroll(() => {
      const enBas = terminal.buffer.active.viewportY >= terminal.buffer.active.baseY
      setSuit(enBas)
    })

    let position = 0
    let vivant = true

    const relire = async (): Promise<void> => {
      const { texte, taille: desormais } = await window.claudex.services.journal(chemin, position)
      if (!vivant) return
      // Le fichier a rétréci : il a basculé, et ce qu'on lisait n'existe plus.
      if (desormais < position) {
        terminal.clear()
        position = 0
      }
      if (texte) {
        terminal.write(texte)
        position = desormais
        if (suitRef.current) terminal.scrollToBottom()
      }
      setTaille(desormais)
    }

    void relire()
    const minuterie = setInterval(() => void relire(), 700)

    return () => {
      vivant = false
      clearInterval(minuterie)
      arretDefilement.dispose()
      surRedimension.disconnect()
      terminal.dispose()
    }
  }, [chemin])

  const poids =
    taille < 1024
      ? `${taille} o`
      : taille < 1024 * 1024
        ? `${Math.round(taille / 1024)} Ko`
        : `${(taille / 1024 / 1024).toFixed(1)} Mo`

  return (
    <div className="flex h-screen flex-col bg-fond">
      <div className="flex shrink-0 items-center gap-3 border-b border-separateur px-3 py-2">
        <span className="truncate text-[13px] text-texte">{titre}</span>
        <span className="truncate font-mono text-[11px] text-texte-tenu">{chemin}</span>
        <div className="flex-1" />
        <span className="shrink-0 font-mono text-[11px] text-texte-faible">{poids}</span>
        <button
          type="button"
          onClick={() => setSuit((v) => !v)}
          title={suit ? 'Le bas suit ce qui arrive' : 'Le défilement est gelé'}
          className={`shrink-0 rounded px-2 py-0.5 font-mono text-[11px] transition-colors ${
            suit ? 'text-succes' : 'text-texte-tenu hover:text-texte'
          }`}
        >
          {suit ? 'suit' : 'gelé'}
        </button>
      </div>
      <div ref={hote} className="min-h-0 flex-1 px-2 py-1" />
    </div>
  )
}
