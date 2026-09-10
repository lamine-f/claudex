import { useState } from 'react'
import type { Tache } from '@shared/types'
import { IconeEnvoyer, IconeFermer, IconeModifier, IconePoignee } from '../ui/Icones'
import { Redaction, Vignettes } from './Redaction'

/**
 * Une consigne dans la file : son rang, ce qu'elle dit, et ce qu'on peut en
 * faire.
 *
 * Elle se corrige sur place, dans le même champ qui a servi à l'écrire. Ouvrir
 * une fenêtre pour changer un mot aurait fait perdre de vue la file, qui est
 * précisément ce qu'on relit en corrigeant.
 */
export function LigneTache({
  tache,
  rang,
  onEnvoyer,
  onModifier,
  onRetirer,
  onDeplacer
}: {
  tache: Tache
  rang: number
  onEnvoyer: () => void
  onModifier: (texte: string, images: string[]) => void
  onRetirer: () => void
  onDeplacer: (depuis: number, vers: number) => void
}): React.JSX.Element {
  const [correction, setCorrection] = useState(false)
  const [survole, setSurvole] = useState(false)

  if (correction) {
    return (
      <li className="px-1.5 py-1">
        <Redaction
          texteInitial={tache.texte}
          imagesInitiales={tache.images ?? []}
          libelle="Enregistrer"
          libelleChamp="Corriger la consigne"
          autoFocus
          onValider={(texte, images) => {
            onModifier(texte, images)
            setCorrection(false)
          }}
          onAnnuler={() => setCorrection(false)}
        />
      </li>
    )
  }

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/claudex-tache', String(rang))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('text/claudex-tache')) return
        e.preventDefault()
        setSurvole(true)
      }}
      onDragLeave={() => setSurvole(false)}
      onDrop={(e) => {
        const venu = e.dataTransfer.getData('text/claudex-tache')
        setSurvole(false)
        if (venu === '') return
        e.preventDefault()
        onDeplacer(Number(venu), rang)
      }}
      className={`group flex items-start gap-1.5 px-1.5 py-1.5 transition-colors hover:bg-fond-survol ${
        survole ? 'border-t border-accent' : ''
      }`}
    >
      <span
        aria-hidden
        className="mt-[1px] flex shrink-0 items-center gap-0.5 font-mono text-[10.5px] text-texte-tenu"
      >
        <span className="text-texte-tenu opacity-0 transition-opacity group-hover:opacity-100">
          <IconePoignee taille={12} />
        </span>
        {rang + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] whitespace-pre-wrap text-texte-doux">{tache.texte}</p>
        {tache.images && tache.images.length > 0 && <Vignettes images={tache.images} />}
      </div>

      {/* Les gestes n'apparaissent qu'au survol : trois icônes par ligne sur une
          file de huit consignes font une colonne d'icônes, et plus une liste. */}
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Geste titre="Envoyer dans le terminal" onClick={onEnvoyer}>
          <IconeEnvoyer taille={13} />
        </Geste>
        <Geste titre="Corriger" onClick={() => setCorrection(true)}>
          <IconeModifier taille={12} />
        </Geste>
        <Geste titre="Retirer de la file" onClick={onRetirer}>
          <IconeFermer taille={12} />
        </Geste>
      </span>
    </li>
  )
}

function Geste({
  titre,
  onClick,
  children
}: {
  titre: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      className="flex h-5 w-5 items-center justify-center rounded text-texte-tenu transition-colors hover:bg-fond hover:text-texte"
    >
      {children}
    </button>
  )
}
