import { useStore } from '@renderer/state/store'

export function TitleBar(): React.JSX.Element {
  const diagnostics = useStore((e) => e.diagnostics)
  const ouvrirDiagnostic = useStore((e) => e.ouvrirDiagnostic)
  const soucis = diagnostics.filter((d) => d.severity !== 'ok').length

  return (
    <header className="zone-glissable flex h-11 shrink-0 items-center gap-3 border-b border-bordure bg-fond-panneau pr-3 pl-22">
      <span className="font-mono text-[13px] tracking-tight text-texte-doux">
        Claudex
      </span>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => ouvrirDiagnostic(true)}
        className="flex items-center gap-1.5 rounded-md border border-bordure px-2 py-1 text-[11px] text-texte-doux transition-colors hover:bg-fond-survol hover:text-texte"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${soucis > 0 ? 'bg-alerte' : 'bg-succes'}`}
        />
        {soucis > 0 ? `${soucis} point${soucis > 1 ? 's' : ''} à voir` : 'Tout est prêt'}
      </button>
    </header>
  )
}
