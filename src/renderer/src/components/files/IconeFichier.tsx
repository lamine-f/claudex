import { File, FileText, Folder, FolderOpen, Image, Lock, Settings2 } from 'lucide-react'

/**
 * Marque d'un fichier, par son extension.
 *
 * Un badge de deux ou trois lettres se lit plus vite qu'un pictogramme là où
 * l'extension porte déjà le sens — TS, JSON — et la couleur suffit à trier une
 * liste d'un regard. Les autres types gardent une icône.
 */
const BADGES: Record<string, { texte: string; couleur: string }> = {
  ts: { texte: 'TS', couleur: 'var(--color-info)' },
  tsx: { texte: 'TS', couleur: 'var(--color-info)' },
  js: { texte: 'JS', couleur: 'var(--color-attention)' },
  jsx: { texte: 'JS', couleur: 'var(--color-attention)' },
  mjs: { texte: 'JS', couleur: 'var(--color-attention)' },
  cjs: { texte: 'JS', couleur: 'var(--color-attention)' },
  json: { texte: '{ }', couleur: 'var(--color-attention)' },
  css: { texte: 'CSS', couleur: 'var(--color-cyan)' },
  html: { texte: '<>', couleur: 'var(--color-accent)' },
  py: { texte: 'PY', couleur: 'var(--color-succes)' },
  rs: { texte: 'RS', couleur: 'var(--color-accent)' },
  go: { texte: 'GO', couleur: 'var(--color-cyan)' },
  sh: { texte: '$', couleur: 'var(--color-succes)' },
  zsh: { texte: '$', couleur: 'var(--color-succes)' },
  yml: { texte: 'YML', couleur: 'var(--color-texte-doux)' },
  yaml: { texte: 'YML', couleur: 'var(--color-texte-doux)' }
}

const IMAGES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'icns', 'ico'])
const TEXTES = new Set(['md', 'txt', 'log'])
const REGLAGES = new Set(['gitignore', 'editorconfig', 'dockerignore', 'env', 'conf', 'toml'])
const VERROUS = new Set(['lock'])

interface Props {
  nom: string
  dossier: boolean
  ouvert: boolean
}

export function IconeFichier({ nom, dossier, ouvert }: Props): React.JSX.Element {
  const commun = { size: 13, strokeWidth: 1.5, absoluteStrokeWidth: true } as const

  if (dossier) {
    const Icone = ouvert ? FolderOpen : Folder
    return <Icone {...commun} className="text-texte-faible" />
  }

  // Un nom en « package-lock.json » se juge sur son extension, un « .gitignore »
  // sur son nom entier : les deux formes existent côte à côte dans un projet.
  const point = nom.lastIndexOf('.')
  const extension = (point > 0 ? nom.slice(point + 1) : nom.replace(/^\./, '')).toLowerCase()

  const badge = BADGES[extension]
  if (badge) {
    return (
      <span
        aria-hidden
        className="w-[22px] shrink-0 text-center font-mono text-[9px] leading-[13px] tracking-tight"
        style={{ color: badge.couleur }}
      >
        {badge.texte}
      </span>
    )
  }

  if (IMAGES.has(extension)) return <Image {...commun} className="text-texte-doux" />
  if (TEXTES.has(extension)) return <FileText {...commun} className="text-texte-doux" />
  if (VERROUS.has(extension)) return <Lock {...commun} className="text-texte-tenu" />
  if (REGLAGES.has(extension)) return <Settings2 {...commun} className="text-texte-tenu" />

  return <File {...commun} className="text-texte-tenu" />
}
