import { useStore } from '@renderer/state/store'
import { initiales } from '@renderer/util/temps'

/**
 * Rail des projets.
 *
 * Réduit aux initiales : la place gagnée revient à l'agent, qui est ce qu'on
 * regarde vraiment. Le nom complet reste au survol et dans le fil d'ariane.
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
      className="flex h-full w-[68px] shrink-0 flex-col items-center gap-2 border-r border-separateur bg-fond-rail py-3"
    >
      {workspaces.map((w) => {
        const courant = w.id === actif
        // Le compteur ne vaut que pour le projet courant : les onglets des autres
        // ne sont pas chargés, et afficher zéro serait un mensonge.
        const ouverts = courant ? tabs.length : 0
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => void choisir(w.id)}
            title={`${w.name}\n${w.path}`}
            className={`relative flex h-11 w-11 items-center justify-center rounded-[10px] border font-mono text-[13px] transition-colors ${
              courant
                ? 'border-bordure bg-fond-eleve text-texte'
                : 'border-transparent text-texte-faible hover:bg-fond-survol hover:text-texte-doux'
            }`}
          >
            {courant && (
              <span
                aria-hidden
                className="absolute top-1/2 -left-3 h-5 w-[2px] -translate-y-1/2 rounded-full"
                style={{ background: w.color }}
              />
            )}
            {initiales(w.name)}
            {ouverts > 0 && (
              <span className="absolute -top-1 -right-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-accent px-[3px] font-mono text-[9px] text-fond">
                {ouverts}
              </span>
            )}
          </button>
        )
      })}

      <button
        type="button"
        onClick={() => void ajouter()}
        title="Ajouter un projet"
        className="flex h-11 w-11 items-center justify-center rounded-[10px] text-[17px] text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte-doux"
      >
        +
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => ouvrirDiagnostic(true)}
        title="État de l'environnement"
        className="relative flex h-9 w-11 items-center justify-center rounded-[10px] font-mono text-[10px] tracking-[0.1em] text-texte-tenu transition-colors hover:bg-fond-survol hover:text-texte-faible"
      >
        DIA
        {soucis > 0 && (
          <span className="absolute top-1 right-2 h-[6px] w-[6px] rounded-full bg-attention" />
        )}
      </button>
    </nav>
  )
}
