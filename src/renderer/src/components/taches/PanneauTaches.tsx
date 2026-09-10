import { useEffect, useState } from 'react'
import { cleDe } from '@shared/taches'
import type { Tache } from '@shared/types'
import { useStore } from '@renderer/state/store'
import { IconeFermer, IconeTaches } from '../ui/Icones'
import { LigneTache } from './LigneTache'
import { Redaction } from './Redaction'

/**
 * Le volet des consignes, à droite du terminal.
 *
 * On y prépare ce qu'on demandera ensuite, pendant que l'agent travaille. Rien
 * n'y part tout seul : une consigne s'envoie sur un clic, comme on l'aurait
 * tapée soi-même. C'est le geste qui décide du moment, non l'application.
 *
 * La file appartient à la conversation de l'onglet regardé. Changer d'onglet
 * change de file : ce qu'on prépare parle de ce que cet agent-là vient de
 * faire, et n'a pas de sens ailleurs.
 */
/**
 * La file d'une conversation qui n'a rien préparé.
 *
 * Une constante, et non un tableau neuf à chaque lecture : le sélecteur compare
 * par référence, et rendre `[]` sur place faisait juger l'état changé à chaque
 * rendu. L'écran se redessinait alors sans fin, et React finissait par le
 * démonter.
 */
const AUCUNE: Tache[] = []

export function PanneauTaches(): React.JSX.Element {
  const tabs = useStore((e) => e.tabs)
  const activeTabId = useStore((e) => e.activeTabId)
  const chargerTaches = useStore((e) => e.chargerTaches)
  const ajouterTache = useStore((e) => e.ajouterTache)
  const modifierTache = useStore((e) => e.modifierTache)
  const retirerTache = useStore((e) => e.retirerTache)
  const rangerTache = useStore((e) => e.rangerTache)
  const envoyerTache = useStore((e) => e.envoyerTache)
  const replier = useStore((e) => e.replier)

  const onglet = tabs.find((t) => t.id === activeTabId)
  const cle = onglet ? cleDe(onglet) : undefined
  const taches = useStore((e) => (cle ? (e.taches[cle] ?? AUCUNE) : AUCUNE))
  const [reproche, setReproche] = useState<string | null>(null)

  // La conversation d'un onglet se nomme après coup, quand Claude Code écrit
  // son transcrit : ce qu'on avait préparé change alors de clé côté main, et
  // l'écran doit relire pour le retrouver.
  useEffect(() => {
    if (cle) void chargerTaches(cle)
    setReproche(null)
  }, [cle, chargerTaches])

  return (
    <section
      aria-label="Consignes préparées"
      className="flex h-full min-w-0 flex-col border-l border-separateur bg-fond"
    >
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-separateur pr-1.5 pl-2.5">
        <span aria-hidden className="text-texte-tenu">
          <IconeTaches taille={13} />
        </span>
        <span className="text-[13px] text-texte">Tâches</span>
        {onglet && (
          <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-texte-tenu">
            {onglet.title}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-texte-tenu">
          {taches.length}
        </span>
        <button
          type="button"
          onClick={() => replier('taches')}
          title="Fermer le volet des tâches"
          aria-label="Fermer le volet des tâches"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-texte-tenu transition-colors hover:bg-fond-survol hover:text-texte"
        >
          <IconeFermer taille={12} />
        </button>
      </header>

      {!onglet || !cle ? (
        <p className="px-3 py-4 text-[12px] text-texte-faible">
          Ouvre une conversation : les consignes se préparent pour un agent, et suivent le sien.
        </p>
      ) : (
        <>
          <ul aria-label="File des consignes" className="min-h-0 flex-1 overflow-y-auto py-1">
            {taches.length === 0 && (
              <li className="px-3 py-3 text-[12px] text-texte-faible">
                Rien en attente. Ce qu’on écrit ici part quand on le décide.
              </li>
            )}
            {taches.map((tache, rang) => (
              <LigneTache
                key={tache.id}
                tache={tache}
                rang={rang}
                onEnvoyer={() =>
                  void envoyerTache(cle, tache.id, onglet.id).then((souci) =>
                    setReproche(souci ?? null)
                  )
                }
                onModifier={(texte, images) => void modifierTache(cle, tache.id, { texte, images })}
                onRetirer={() => void retirerTache(cle, tache.id)}
                onDeplacer={(depuis, vers) => {
                  const partante = taches[depuis]
                  if (partante) void rangerTache(cle, partante.id, vers)
                }}
              />
            ))}
          </ul>

          <div className="shrink-0 border-t border-separateur px-2 py-2">
            {reproche && <p className="mb-1.5 text-[11px] text-erreur">{reproche}</p>}
            <Redaction
              libelle="Ajouter"
              libelleChamp="Écrire une consigne"
              onValider={(texte, images) => void ajouterTache(cle, texte, images)}
            />
          </div>
        </>
      )}
    </section>
  )
}
