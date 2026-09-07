import { useState } from 'react'
import type { DepotGit } from '@shared/types'
import { useStore } from '@renderer/state/store'
import { cleDe } from './ListeChangements'

/** Ce qu'un dépôt a donné, tel que le processus principal le rapporte. */
interface Compte {
  depot: string
  nom: string
  fait: boolean
  message?: string
}

/**
 * Le message et les deux gestes, sous la liste des changements.
 *
 * Cocher des fichiers dans trois dépôts et commiter écrit trois commits, un par
 * dépôt, avec le même message. C'est ce que fait déjà à la main quiconque
 * travaille sur seize dépôts à la fois.
 */
export function PanneauCommit({ workspaceId }: { workspaceId: string }): React.JSX.Element | null {
  const git = useStore((e) => e.git)
  const coches = useStore((e) => e.coches)
  const cocher = useStore((e) => e.cocher)
  const rafraichirGit = useStore((e) => e.rafraichirGit)

  const [message, setMessage] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [comptes, setComptes] = useState<Compte[] | null>(null)

  const lots = repartir(git?.depots, coches)
  const fichiers = lots.reduce((total, lot) => total + lot.fichiers.length, 0)
  const pret = fichiers > 0 && message.trim().length > 0 && !enCours

  if (!git || git.depots.length === 0) return null

  const commiter = async (pousserAussi: boolean): Promise<void> => {
    setEnCours(true)
    setComptes(null)
    try {
      const rendus = await window.claudex.git.commiter(workspaceId, lots, message, pousserAussi)
      setComptes(rendus)
      // Ce qui est parti n'a plus à être coché, ce qui a échoué le reste : on
      // recommence sans avoir à retrouver ses fichiers.
      const partis = new Set(rendus.filter((c) => c.fait).map((c) => c.depot))
      cocher(
        lots.filter((l) => partis.has(l.depot)).flatMap((l) => l.fichiers.map((f) => cleDe(l.depot, f))),
        false
      )
      if (rendus.some((c) => c.fait)) setMessage('')
      await rafraichirGit()
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="shrink-0 border-t border-separateur px-2.5 py-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          // Le raccourci d'IntelliJ, et celui de tous les champs de message :
          // la touche seule fait un retour à la ligne, le corps d'un commit en
          // ayant besoin.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && pret) void commiter(false)
        }}
        rows={3}
        placeholder="Message du commit"
        aria-label="Message du commit"
        className="w-full resize-none rounded-md border border-separateur bg-fond-creux px-2.5 py-2 font-mono text-[12px] text-texte-doux placeholder:text-texte-tenu focus:border-bordure focus:outline-none"
      />

      {comptes && <CompteRendu comptes={comptes} />}

      {/* Ce qui est coché se lit au-dessus des gestes, non à côté. Posée sur la
          même ligne, cette mesure prenait la largeur qui manquait au second
          bouton, dont l'intitulé passait à deux lignes. */}
      <p className="mt-2 text-right font-mono text-[10.5px] text-texte-tenu">
        {enCours
          ? 'en cours…'
          : fichiers === 0
            ? 'rien de coché'
            : `${fichiers} fichier${fichiers > 1 ? 's' : ''} · ${lots.length} dépôt${
                lots.length > 1 ? 's' : ''
              }`}
      </p>

      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          disabled={!pret}
          onClick={() => void commiter(false)}
          className="flex-1 truncate rounded-md bg-projet px-3 py-1.5 text-[12.5px] whitespace-nowrap text-fond transition-opacity disabled:opacity-35"
        >
          Commiter
        </button>
        <button
          type="button"
          disabled={!pret}
          onClick={() => void commiter(true)}
          className="flex-1 truncate rounded-md border border-bordure px-3 py-1.5 text-[12.5px] whitespace-nowrap text-texte-doux transition-opacity hover:bg-fond-survol disabled:opacity-35"
        >
          Commiter et pousser
        </button>
      </div>
    </div>
  )
}

/**
 * Ce que chaque dépôt a donné.
 *
 * Trois dépôts, un qui refuse : les deux autres ont commité. Le dire dépôt par
 * dépôt est la seule façon honnête de rendre compte d'un geste qui réussit à
 * moitié.
 */
function CompteRendu({ comptes }: { comptes: Compte[] }): React.JSX.Element {
  return (
    <ul className="mt-2 flex flex-col gap-1" aria-label="Compte rendu du commit">
      {comptes.map((compte) => (
        <li key={compte.depot} className="flex items-baseline gap-1.5 text-[11.5px]">
          <span className={`shrink-0 ${compte.fait ? 'text-succes' : 'text-erreur'}`}>
            {compte.fait ? '✓' : '✕'}
          </span>
          <span className="shrink-0 font-mono text-texte-doux">{compte.nom}</span>
          {compte.message && (
            // La sortie de git telle quelle : un `pre-commit` qui refuse
            // explique pourquoi, et c'est cette explication qui sert à corriger.
            <span className="min-w-0 flex-1 font-mono text-[10.5px] whitespace-pre-wrap text-texte-tenu">
              {compte.message}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Répartit les fichiers cochés dans leur dépôt.
 *
 * La clé d'une case porte le chemin absolu du dépôt et celui du fichier :
 * cocher `pom.xml` dans deux dépôts fait deux entrées distinctes.
 */
function repartir(
  depots: DepotGit[] | undefined,
  coches: string[]
): { depot: string; fichiers: string[] }[] {
  return (depots ?? [])
    .map((d) => ({
      depot: d.chemin,
      fichiers: d.fichiers.map((f) => f.chemin).filter((f) => coches.includes(cleDe(d.chemin, f)))
    }))
    .filter((lot) => lot.fichiers.length > 0)
}
