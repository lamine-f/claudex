interface Props {
  titre: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/** Colonne de l'espace de travail : un en-tête discret et un corps défilant. */
export function Panneau({ titre, action, children, className = '' }: Props): React.JSX.Element {
  return (
    // Le titre sert aussi de repère d'accessibilité : les mêmes mots peuvent
    // apparaître dans plusieurs colonnes, et il faut pouvoir les distinguer.
    <section
      aria-label={titre}
      className={`flex h-full min-w-0 flex-col bg-fond-panneau ${className}`}
    >
      <div className="flex h-8 shrink-0 items-center justify-between px-3">
        <h2 className="text-[10px] font-semibold tracking-[0.12em] text-texte-faible uppercase">
          {titre}
        </h2>
        {action}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  )
}
