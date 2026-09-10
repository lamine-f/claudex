/**
 * Les consignes préparées d'avance, et ce qu'il faut pour les dire à un agent.
 *
 * Rien ici ne touche au disque ni au terminal : le texte entre, le texte sort.
 */

import type { Tab, Tache } from './types'

/**
 * La clé sous laquelle une conversation range ses consignes.
 *
 * L'identifiant de la conversation quand il existe, celui de l'onglet sinon.
 * L'uuid est ce qui suit une conversation d'un onglet à l'autre : la rouvrir
 * depuis la colonne crée un nouvel onglet, et une file rangée par onglet serait
 * alors introuvable. Un onglet neuf, lui, n'a pas encore d'uuid, et il faut
 * bien pouvoir y écrire avant que Claude Code n'ait rendu le sien.
 */
export function cleDe(onglet: Pick<Tab, 'id' | 'claudeSessionId'>): string {
  return onglet.claudeSessionId ?? onglet.id
}

/**
 * Déplace les consignes d'une clé à l'autre.
 *
 * Sert au moment où un onglet gagne son uuid : ce qu'on y avait préparé sous
 * l'identifiant de l'onglet doit suivre la conversation, sans quoi il
 * disparaîtrait de l'écran à la seconde où l'agent démarre.
 */
export function migrer(
  taches: Record<string, Tache[]>,
  de: string,
  vers: string
): Record<string, Tache[]> {
  const partantes = taches[de]
  if (!partantes || partantes.length === 0 || de === vers) return taches

  const reste = { ...taches }
  delete reste[de]
  return { ...reste, [vers]: [...(taches[vers] ?? []), ...partantes] }
}

/** Range une consigne à une nouvelle place, les autres se décalant. */
export function deplacer(taches: Tache[], id: string, vers: number): Tache[] {
  const depart = taches.findIndex((t) => t.id === id)
  if (depart < 0) return taches

  const place = Math.max(0, Math.min(taches.length - 1, vers))
  if (place === depart) return taches

  const suite = [...taches]
  const [prise] = suite.splice(depart, 1)
  if (prise) suite.splice(place, 0, prise)
  return suite
}

/**
 * Ce qui doit être protégé dans un chemin de fichier.
 *
 * L'échappement du shell, celui qu'un terminal pose quand on y glisse un
 * fichier. Mesuré des deux façons : Claude Code lit l'image avec ou sans, même
 * quand le chemin porte des espaces. On garde l'échappement parce qu'il est ce
 * que l'agent voit d'habitude, et qu'il ne coûte rien.
 */
const A_PROTEGER = /[ '"\\()[\]{}&;|<>$`*?!#~]/g

export function echapper(chemin: string): string {
  return chemin.replace(A_PROTEGER, (caractere) => `\\${caractere}`)
}

/**
 * Le texte de la consigne, tel qu'il part dans le terminal.
 *
 * Les images sont jointes par leur chemin, sur une ligne à part : c'est ainsi
 * que Claude Code les lit, et c'est ce qu'un glisser-déposer dans un terminal
 * produit.
 */
export function pourEnvoi(tache: Tache): string {
  const images = (tache.images ?? []).map(echapper).join(' ')
  return [tache.texte.trim(), images].filter((morceau) => morceau !== '').join('\n\n')
}

/** Vrai quand la consigne n'a rien à dire, ni texte ni image. */
export function estVide(tache: Pick<Tache, 'texte' | 'images'>): boolean {
  return tache.texte.trim() === '' && (tache.images ?? []).length === 0
}

const DEBUT_COLLAGE = '\u001b[200~'
const FIN_COLLAGE = '\u001b[201~'

/**
 * Encadre un texte comme le fait un collage.
 *
 * Sans cela, un texte de plusieurs lignes vaut autant de validations : la
 * première ligne part seule, et les suivantes arrivent dans une conversation
 * qui a déjà repris. Le collage encadré dit au programme que tout ce qui suit
 * est une seule saisie, ce qui est justement ce qu'on veut.
 *
 * Une marque de fin trouvée dans le texte lui-même est retirée : elle
 * refermerait le collage en son milieu.
 */
export function encadrer(texte: string): string {
  return `${DEBUT_COLLAGE}${texte.replaceAll(FIN_COLLAGE, '')}${FIN_COLLAGE}`
}

/**
 * Les fichiers d'images qu'aucune consigne ne réclame plus.
 *
 * Une consigne envoyée quitte la file mais laisse son image derrière elle :
 * l'agent doit encore pouvoir la lire quand il traite la demande. Le ménage se
 * fait donc plus tard, et sur ce qui a vieilli.
 */
export function orphelines(taches: Record<string, Tache[]>, fichiers: string[]): string[] {
  const tenus = new Set(
    Object.values(taches).flatMap((liste) => liste.flatMap((t) => t.images ?? []))
  )
  return fichiers.filter((fichier) => !tenus.has(fichier))
}
