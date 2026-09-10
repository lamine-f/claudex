import { useEffect, useRef, useState } from 'react'
import { urlMedia } from '@shared/media'
import { estVide } from '@shared/taches'
import { IconeFermer, IconeJoindre } from '../ui/Icones'

/** Au-delà, ce n'est plus une capture d'écran mais un fichier qu'on déplace. */
const POIDS_MAX = 20 * 1024 * 1024

/**
 * Où l'on écrit une consigne, et où l'on y joint des images.
 *
 * Le même champ sert à la rédaction et à la correction : ce qu'on écrit et ce
 * qu'on relit ont la même forme, et une consigne qu'on corrige doit pouvoir
 * gagner une image comme une consigne neuve.
 *
 * Les images entrent par les trois chemins qu'on essaie sans y penser : le
 * collage, le glisser-déposer, et le dialogue du système. Aucun ne suffit
 * seul — une capture prise au clavier est dans le presse-papier, un fichier
 * reçu est dans le Finder.
 */
export function Redaction({
  texteInitial = '',
  imagesInitiales = [],
  libelle,
  libelleChamp,
  autoFocus,
  onValider,
  onAnnuler
}: {
  texteInitial?: string
  imagesInitiales?: string[]
  /** Ce que dit le bouton de validation. */
  libelle: string
  /** Comment le champ se nomme, pour qui ne voit pas l'écran. */
  libelleChamp: string
  autoFocus?: boolean
  onValider: (texte: string, images: string[]) => void
  onAnnuler?: () => void
}): React.JSX.Element {
  const [texte, setTexte] = useState(texteInitial)
  const [images, setImages] = useState<string[]>(imagesInitiales)
  const [survol, setSurvol] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [reproche, setReproche] = useState<string | null>(null)
  const champ = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) champ.current?.focus()
  }, [autoFocus])

  const pret = !estVide({ texte, images })

  const accueillir = async (fichiers: File[]): Promise<void> => {
    const retenus = fichiers.filter((f) => f.type.startsWith('image/'))
    if (retenus.length === 0) return

    const trop = retenus.find((f) => f.size > POIDS_MAX)
    if (trop) {
      setReproche(`${trop.name} dépasse 20 Mo.`)
      return
    }

    setEnCours(true)
    setReproche(null)
    try {
      const chemins = await Promise.all(
        retenus.map(async (fichier) =>
          window.claudex.taches.joindre(
            new Uint8Array(await fichier.arrayBuffer()),
            fichier.type
          )
        )
      )
      setImages((avant) => [...avant, ...chemins])
    } finally {
      setEnCours(false)
    }
  }

  const valider = (): void => {
    if (!pret) return
    onValider(texte.trim(), images)
    setTexte('')
    setImages([])
    champ.current?.focus()
  }

  return (
    <div
      onDragOver={(e) => {
        // Sans cela, la fenêtre ouvre le fichier déposé et quitte l'application.
        e.preventDefault()
        setSurvol(true)
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault()
        setSurvol(false)
        void accueillir([...e.dataTransfer.files])
      }}
      className={`shrink-0 rounded-md border px-2 py-2 transition-colors ${
        survol ? 'border-accent bg-fond-survol' : 'border-separateur bg-fond-creux'
      }`}
    >
      <textarea
        ref={champ}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onPaste={(e) => {
          const fichiers = [...e.clipboardData.files]
          if (fichiers.some((f) => f.type.startsWith('image/'))) {
            // Une capture collée n'a pas de texte à donner : la laisser passer
            // écrirait le nom du fichier dans la consigne, ou rien du tout.
            e.preventDefault()
            void accueillir(fichiers)
          }
        }}
        onKeyDown={(e) => {
          // La touche seule fait un retour à la ligne : une consigne tient
          // rarement sur une ligne, et la valider par accident au premier
          // alinéa enverrait une demande à moitié écrite.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            valider()
          }
          if (e.key === 'Escape' && onAnnuler) {
            e.preventDefault()
            onAnnuler()
          }
        }}
        placeholder="Écrire une consigne, coller une image…"
        aria-label={libelleChamp}
        // La hauteur suit le texte, par le navigateur et non à la main : une
        // consigne de dix lignes s'écrit sans que le champ ne reste une fenêtre
        // à deux lignes. Mesurer soi-même avec `scrollHeight` ne marchait pas
        // ici — il rend la hauteur de la boîte déjà posée, et le champ vide
        // s'ouvrait à 260 px.
        className="max-h-[260px] min-h-[34px] w-full resize-none bg-transparent text-[12.5px] field-sizing-content text-texte-doux placeholder:text-texte-tenu focus:outline-none"
      />

      {images.length > 0 && (
        <Vignettes images={images} onRetirer={(c) => setImages(images.filter((i) => i !== c))} />
      )}

      {reproche && <p className="mt-1 text-[10.5px] text-erreur">{reproche}</p>}

      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() =>
            void window.claudex.taches.choisirImages().then((chemins) => {
              if (chemins.length > 0) setImages((avant) => [...avant, ...chemins])
            })
          }
          title="Joindre une image"
          aria-label="Joindre une image"
          className="flex h-6 w-6 items-center justify-center rounded-md text-texte-tenu transition-colors hover:bg-fond-survol hover:text-texte"
        >
          <IconeJoindre taille={14} />
        </button>

        <span className="font-mono text-[10px] text-texte-tenu">
          {enCours ? 'image…' : images.length > 0 ? `${images.length} image(s)` : ''}
        </span>

        <div className="flex-1" />

        {onAnnuler && (
          <button
            type="button"
            onClick={onAnnuler}
            className="rounded-md px-2 py-1 text-[11.5px] text-texte-tenu transition-colors hover:bg-fond-survol hover:text-texte"
          >
            Annuler
          </button>
        )}
        <button
          type="button"
          disabled={!pret}
          onClick={valider}
          className="rounded-md bg-projet px-2.5 py-1 text-[11.5px] text-fond transition-opacity disabled:opacity-35"
        >
          {libelle}
        </button>
      </div>
    </div>
  )
}

/** Les images jointes, à la taille où l'on reconnaît ce qu'elles montrent. */
export function Vignettes({
  images,
  onRetirer
}: {
  images: string[]
  onRetirer?: (chemin: string) => void
}): React.JSX.Element {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Images jointes">
      {images.map((chemin) => (
        <li key={chemin} className="group relative">
          <img
            src={urlMedia(chemin)}
            alt={chemin.split(/[\\/]/).pop() ?? 'image'}
            className="h-12 w-12 rounded border border-separateur object-cover"
          />
          {onRetirer && (
            <button
              type="button"
              onClick={() => onRetirer(chemin)}
              title="Retirer cette image"
              aria-label="Retirer cette image"
              className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-bordure bg-fond text-texte-tenu opacity-0 transition-opacity group-hover:opacity-100 hover:text-texte"
            >
              <IconeFermer taille={9} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
