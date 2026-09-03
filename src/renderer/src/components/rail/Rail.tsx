import { useStore } from '@renderer/state/store'
import { IconePlus } from '../ui/Icones'

/**
 * Colonne des projets.
 *
 * Les noms sont écrits en toutes lettres : réduits à leurs initiales, ils
 * devenaient indéchiffrables dès que plusieurs projets partageaient les mêmes
 * premières lettres. Les lignes restent compactes pour que la largeur prise
 * reste modeste.
 */
export function Rail(): React.JSX.Element {
  const workspaces = useStore((e) => e.workspaces)
  const actif = useStore((e) => e.activeWorkspaceId)
  const tabs = useStore((e) => e.tabs)
  const choisir = useStore((e) => e.choisirWorkspace)
  const ajouter = useStore((e) => e.ajouterWorkspace)
  const diagnostics = useStore((e) => e.diagnostics)
  const ouvrirDiagnostic = useStore((e) => e.ouvrirDiagnostic)

  const soucis = diagnostics.filter((d) => d.severity !== 'ok').length

  return (
    <nav
      aria-label="Projets"
      className="flex h-full w-[212px] shrink-0 flex-col border-r border-separateur bg-fond-rail py-3"
    >
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {workspaces.map((w) => {
          const courant = w.id === actif
          // Le compteur ne vaut que pour le projet courant : les onglets des
          // autres ne sont pas chargés, et afficher zéro serait un mensonge.
          const ouverts = courant ? tabs.length : 0
          return (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => void choisir(w.id)}
                title={w.path}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
                  courant ? 'bg-fond-eleve' : 'hover:bg-fond-survol'
                }`}
              >
                <span
                  aria-hidden
                  className="h-4 w-[2px] shrink-0 rounded-full"
                  style={{ background: courant ? w.color : 'transparent' }}
                />
                <span
                  className={`min-w-0 flex-1 truncate text-[14.5px] ${
                    courant ? 'text-texte' : 'text-texte-faible'
                  }`}
                >
                  {w.name}
                </span>
                {ouverts > 0 && (
                  <span className="flex h-[15px] min-w-[15px] shrink-0 items-center justify-center rounded-full bg-accent px-[3px] font-mono text-[9px] text-fond">
                    {ouverts}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-separateur px-2 pt-2">
        <button
          type="button"
          onClick={() => void ajouter()}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[14px] text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte-doux"
        >
          <span aria-hidden className="w-[2px] shrink-0" />
          <IconePlus taille={15} />
          Ajouter un projet
        </button>

        <button
          type="button"
          onClick={() => ouvrirDiagnostic(true)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[14px] text-texte-tenu transition-colors hover:bg-fond-survol hover:text-texte-faible"
        >
          <span
            aria-hidden
            className={`ml-[3px] h-[7px] w-[7px] shrink-0 rounded-full ${
              soucis > 0 ? 'bg-attention' : 'bg-succes'
            }`}
          />
          {soucis > 0 ? `${soucis} point${soucis > 1 ? 's' : ''} à voir` : 'Environnement'}
        </button>
      </div>
    </nav>
  )
}
