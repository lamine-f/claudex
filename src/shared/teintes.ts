/**
 * La teinte qui relie ce qui est ouvert à ce dont il vient.
 *
 * Un onglet de terminal vient d'une conversation, une vue de diff d'un fichier,
 * un journal d'un service. Une fois ouvert, plus rien ne dit de quoi : on
 * cherche dans la colonne la ligne qui a produit ce qu'on regarde, et l'on ne
 * la trouve qu'en se souvenant.
 *
 * La même teinte des deux côtés le dit d'un coup d'œil. C'est déjà ce que fait
 * la couleur d'un projet, du rail jusqu'à l'onglet.
 */

/**
 * Six teintes, prises dans la palette du thème.
 *
 * Assez pour ce qu'on tient ouvert en même temps, et toutes assez distinctes
 * pour se reconnaître sur un fond noir. Au-delà, on recommence : deux éléments
 * de même teinte se distinguent alors par leur place, faute de mieux.
 */
export const TEINTES = [
  'var(--color-info)',
  'var(--color-succes)',
  'var(--color-attention)',
  'var(--color-cyan)',
  'var(--color-erreur)',
  'var(--color-accent)'
] as const

/**
 * La teinte d'un élément, d'après son rang parmi ceux qui sont ouverts.
 *
 * Le rang plutôt qu'un calcul sur l'identifiant : deux éléments ouverts en même
 * temps doivent porter deux teintes différentes, ce qu'un hachage ne garantit
 * pas. La contrepartie est qu'une teinte change quand on ferme ce qui précède,
 * et c'est le bon compromis : ce qui compte est de distinguer ce qu'on tient
 * ouvert maintenant, non de retenir une couleur d'un jour à l'autre.
 */
export function teintePour(id: string, ouverts: string[]): string | undefined {
  const rang = ouverts.indexOf(id)
  return rang < 0 ? undefined : TEINTES[rang % TEINTES.length]
}

/**
 * La couleur d'un groupe, tirée de son nom.
 *
 * Stable d'un lancement à l'autre, contrairement à la teinte de ce qui est
 * ouvert : un groupe garde son nom, et l'œil s'habitue à sa couleur. Onze
 * services back les uns sous les autres se suivaient mal sans elle.
 */
export function couleurDeGroupe(nom: string): string {
  let somme = 0
  for (let i = 0; i < nom.length; i++) somme = (somme * 31 + nom.charCodeAt(i)) >>> 0
  return TEINTES[somme % TEINTES.length]!
}
