/** Séparateur entre l'origine d'une branche et ce qu'elle explore. */
export const SEPARATEUR = ' -- '

/**
 * Racine d'un nom de branche : ce dont tout descend.
 *
 * Bifurquer une branche ne doit pas empiler les préfixes — « A -- b -- c -- d »
 * devient illisible en trois niveaux et ne dit pas mieux d'où l'on vient que
 * « A ». Seule l'origine première est conservée.
 */
export function racine(nom: string): string {
  const coupe = nom.indexOf(SEPARATEUR)
  return coupe === -1 ? nom : nom.slice(0, coupe)
}

/** Nom d'une branche à partir de son origine et de ce qu'elle explore. */
export function nommerBranche(origine: string, explore: string): string {
  return `${racine(origine)}${SEPARATEUR}${explore.trim() || 'branche'}`
}
