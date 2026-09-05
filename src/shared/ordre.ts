/**
 * Rangement d'une liste par glisser-déposer.
 *
 * Le geste est le même partout : on prend une ligne, on la lâche au-dessus ou
 * en dessous d'une autre. Ce qu'il faut en tirer tient en deux calculs, écrits
 * ici plutôt que dans chaque écran qui les refait à sa façon.
 */

/** Où la ligne lâchée doit atterrir par rapport à celle qui la reçoit. */
export type Position = 'avant' | 'apres'

/**
 * Renvoie l'ordre des identifiants après le déplacement.
 *
 * La ligne déplacée sort d'abord de la liste, puis y rentre à sa nouvelle
 * place : compter le rang de la cible sans avoir retiré la source décalerait
 * d'un cran tout déplacement vers le bas.
 */
export function reordonner(
  ids: string[],
  source: string,
  cible: string,
  position: Position
): string[] {
  if (source === cible || !ids.includes(source) || !ids.includes(cible)) return ids
  const restants = ids.filter((id) => id !== source)
  const rang = restants.indexOf(cible)
  restants.splice(position === 'avant' ? rang : rang + 1, 0, source)
  return restants
}

/**
 * Range des éléments selon un ordre d'identifiants.
 *
 * Ce que l'ordre ne cite pas passe à la fin plutôt que de disparaître : un
 * projet ajouté pendant qu'on déplaçait les autres n'a pas à être perdu par un
 * rangement qui l'ignorait.
 */
export function rangerSelon<T extends { id: string }>(elements: T[], ids: string[]): T[] {
  const parId = new Map(elements.map((e) => [e.id, e]))
  const cites = ids.map((id) => parId.get(id)).filter((e): e is T => e !== undefined)
  const vus = new Set(cites.map((e) => e.id))
  return [...cites, ...elements.filter((e) => !vus.has(e.id))]
}
