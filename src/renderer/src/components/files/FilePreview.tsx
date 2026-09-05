import { useEffect, useMemo, useState } from 'react'
import { json } from '@codemirror/lang-json'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import CodeMirror from '@uiw/react-codemirror'
import { useStore } from '@renderer/state/store'
import { GESTIONNAIRE_FICHIERS } from '@renderer/systeme'

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

  // Un format que le système reconnaît ne se lit pas forcément ici : un .mov en
  // ProRes, par exemple. Le dire vaut mieux qu'un cadre noir, et l'on propose
  // alors de l'ouvrir là où il se lira.
  const [illisible, setIllisible] = useState(false)
  useEffect(() => setIllisible(false), [chemin])

  if (!chemin) return null

  const echec = (
    <div className="px-4 py-3 text-[12px] text-texte-faible">
      <p>Ce format ne se lit pas dans Claudex.</p>
      <button
        type="button"
        onClick={() => void window.claudex.fs.montrer(chemin)}
        className="mt-2 rounded-md border border-bordure px-2.5 py-1 text-texte-doux transition-colors hover:bg-fond-survol hover:text-texte"
      >
        Afficher dans {GESTIONNAIRE_FICHIERS}
      </button>
    </div>
  )

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
            {/* Les deux séparateurs, parce que le chemin vient du système : sur
                Windows il est en antislash, et découper sur la seule barre
                oblique affichait le chemin entier en guise de nom de fichier. */}
            <p className="truncate font-mono text-[12.5px] text-texte">
              {chemin.split(/[\\/]/).pop()}
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
          ) : apercu.type === 'texte' ? (
            <CodeMirror
              value={apercu.contenu}
              extensions={extensions}
              theme={oneDark}
              editable={false}
              basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false }}
            />
          ) : illisible ? (
            echec
          ) : apercu.type === 'video' ? (
            <div className="flex h-full items-center justify-center bg-black p-2">
              <video
                src={apercu.url}
                controls
                onError={() => setIllisible(true)}
                className="max-h-full max-w-full"
              />
            </div>
          ) : apercu.type === 'audio' ? (
            <div className="flex h-full items-center justify-center p-6">
              <audio
                src={apercu.url}
                controls
                onError={() => setIllisible(true)}
                className="w-full max-w-lg"
              />
            </div>
          ) : (
            // Le damier sous l'image : sans lui, un PNG transparent se lit mal
            // sur un fond sombre, et l'on ne sait pas ce qui est vide.
            <div
              className="flex h-full items-center justify-center p-4"
              style={{
                backgroundImage:
                  'linear-gradient(45deg, #1a1a1a 25%, transparent 25%, transparent 75%, #1a1a1a 75%), linear-gradient(45deg, #1a1a1a 25%, transparent 25%, transparent 75%, #1a1a1a 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 8px 8px'
              }}
            >
              <img
                src={apercu.url}
                alt={chemin.split(/[\\/]/).pop()}
                onError={() => setIllisible(true)}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
