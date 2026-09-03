/**
 * Icônes de l'interface.
 *
 * Dessinées plutôt que tapées : une glyphe dépend de la police installée et se
 * réduit parfois à un carré vide. Toutes partagent la même grille de 16 et la
 * même épaisseur de trait, pour qu'un alignement de plusieurs reste calme.
 */
interface Props {
  taille?: number
  className?: string
}

function Trace({
  taille = 12,
  className,
  children
}: Props & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={className}
    >
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  )
}

/** Branche git : deux fils, l'un qui part de l'autre. */
export function IconeBranche(p: Props): React.JSX.Element {
  return (
    <Trace {...p}>
      <circle cx="4.5" cy="3.5" r="1.8" />
      <circle cx="4.5" cy="12.5" r="1.8" />
      <circle cx="11.5" cy="6.5" r="1.8" />
      <path d="M4.5 5.3v5.4M4.5 10.7c0-2.3 1.6-4.2 5.2-4.2" />
    </Trace>
  )
}

/** Fichier que git ne suit pas encore. */
export function IconeNonSuivi(p: Props): React.JSX.Element {
  return (
    <Trace {...p}>
      <path d="M9 1.8H4.4a1.2 1.2 0 0 0-1.2 1.2v10a1.2 1.2 0 0 0 1.2 1.2h5.2" />
      <path d="M9 1.8 12.8 5.6V9" />
      <path d="M11.4 11v3.4M9.7 12.7h3.4" />
    </Trace>
  )
}

/** Fichier modifié mais pas encore enregistré. */
export function IconeModifie(p: Props): React.JSX.Element {
  return (
    <Trace {...p}>
      <path d="M9 1.8H4.4a1.2 1.2 0 0 0-1.2 1.2v10a1.2 1.2 0 0 0 1.2 1.2h7.2a1.2 1.2 0 0 0 1.2-1.2V5.6z" />
      <path d="M9 1.8v3.8h3.8" />
      <circle cx="8" cy="10" r="1.4" fill="currentColor" stroke="none" />
    </Trace>
  )
}

/** Multiplexeur de terminal : une fenêtre partagée. */
export function IconeTerminal(p: Props): React.JSX.Element {
  return (
    <Trace {...p}>
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6" />
      <path d="M4.6 6.4 6.6 8l-2 1.6M8.4 10.2h3" />
    </Trace>
  )
}

/** L'étincelle de Claude Code. */
export function IconeEtincelle(p: Props): React.JSX.Element {
  return (
    <Trace {...p}>
      <path d="M8 1.6v12.8M1.6 8h12.8M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </Trace>
  )
}
