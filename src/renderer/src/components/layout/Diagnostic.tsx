import { useState } from 'react'
import type { DoctorSeverity } from '@shared/types'
import { useStore } from '@renderer/state/store'

const PASTILLE: Record<DoctorSeverity, string> = {
  ok: 'bg-succes',
  warn: 'bg-alerte',
  error: 'bg-erreur'
}

export function Diagnostic(): React.JSX.Element | null {
  const ouvert = useStore((e) => e.diagnosticOuvert)
  const diagnostics = useStore((e) => e.diagnostics)
  const fermer = useStore((e) => e.ouvrirDiagnostic)
  const appliquer = useStore((e) => e.appliquerCorrectifRetention)
  const [message, setMessage] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  if (!ouvert) return null

  const lancerCorrectif = async (): Promise<void> => {
    setEnCours(true)
    try {
      setMessage(await appliquer())
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      onClick={() => fermer(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-bordure-forte bg-fond-panneau shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-bordure px-4 py-3">
          <h2 className="text-[13px] font-medium text-texte">État de l'environnement</h2>
          <button
            type="button"
            onClick={() => fermer(false)}
            className="rounded px-2 py-0.5 text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte"
          >
            ✕
          </button>
        </div>

        <ul className="divide-y divide-bordure">
          {diagnostics.map((d) => (
            <li key={d.id} className="flex gap-3 px-4 py-3">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${PASTILLE[d.severity]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-texte">{d.label}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-texte-faible">{d.detail}</p>
                {d.fix && (
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => void lancerCorrectif()}
                    className="mt-2 rounded-md border border-accent-doux bg-accent-doux/25 px-2.5 py-1 text-[12px] text-accent transition-colors hover:bg-accent-doux/40 disabled:opacity-50"
                  >
                    {enCours ? 'En cours…' : d.fix.label}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {message && (
          <p className="border-t border-bordure px-4 py-3 text-[12px] text-succes">{message}</p>
        )}
      </div>
    </div>
  )
}
