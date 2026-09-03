import { useEffect, useMemo } from 'react'
import { json } from '@codemirror/lang-json'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import CodeMirror from '@uiw/react-codemirror'
import { useStore } from '@renderer/state/store'

const poids = (octets: number): string =>
  octets < 1024
    ? `${octets} o`
    : octets < 1024 * 1024
      ? `${Math.round(octets / 1024)} Ko`
      : `${(octets / 1024 / 1024).toFixed(1)} Mo`

function extensionLangage(langage: string): ReturnType<typeof javascript>[] {
  switch (langage) {
    case 'typescript':
      return [javascript({ typescript: true, jsx: true })]
    case 'javascript':
      return [javascript({ jsx: true })]
    case 'json':
      return [json()]
    case 'markdown':
      return [markdown()]
    case 'python':
      return [python()]
    default:
      return []
  }
}

/**
 * Aperçu en lecture seule, affiché en panneau large : la colonne des fichiers est
 * trop étroite pour du code lisible. CodeMirror plutôt qu'un simple bloc de texte,
 * pour que l'édition puisse s'y greffer sans rien réécrire.
 */
export function FilePreview(): React.JSX.Element | null {
  const chemin = useStore((e) => e.fichierChoisi)
  const apercu = useStore((e) => e.apercu)
  const fermer = useStore((e) => e.fermerApercu)

  useEffect(() => {
    if (!chemin) return
    const surTouche = (evenement: KeyboardEvent): void => {
      if (evenement.key === 'Escape') fermer()
    }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [chemin, fermer])

  const extensions = useMemo(
    () => (apercu?.type === 'texte' ? extensionLangage(apercu.langage) : []),
    [apercu]
  )

  if (!chemin) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-10"
      onClick={fermer}
    >
      <div
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-bordure bg-fond-panneau shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-bordure px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-mono text-[12.5px] text-texte">
              {chemin.split('/').pop()}
            </p>
            <p className="truncate text-[11px] text-texte-faible">{chemin}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {apercu && (
              <span className="font-mono text-[11px] text-texte-faible">
                {poids(apercu.octets)}
              </span>
            )}
            <button
              type="button"
              onClick={fermer}
              title="Fermer (Échap)"
              className="rounded px-2 py-0.5 text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {!apercu ? (
            <p className="px-4 py-3 text-[12px] text-texte-faible">Lecture…</p>
          ) : apercu.type === 'trop-gros' ? (
            <p className="px-4 py-3 text-[12px] text-texte-faible">
              Fichier trop volumineux pour un aperçu ({poids(apercu.octets)}). Ouvre-le depuis le
              terminal si tu as besoin de le lire.
            </p>
          ) : apercu.type === 'binaire' ? (
            <p className="px-4 py-3 text-[12px] text-texte-faible">
              Fichier binaire ({poids(apercu.octets)}) : rien à afficher.
            </p>
          ) : (
            <CodeMirror
              value={apercu.contenu}
              extensions={extensions}
              theme={oneDark}
              editable={false}
              basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
