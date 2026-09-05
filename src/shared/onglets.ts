/**
 * Ce que l'on regardait en quittant un projet.
 *
 * Les onglets restent affichés dans l'ordre où ils ont été ouverts : c'est un
 * repère qui ne doit pas bouger sous la souris. La dernière visite est donc
 * portée par chaque onglet plutôt que par leur rang, et c'est elle qu'on lit
 * pour rouvrir un projet là où on l'avait laissé.
 */
export function dernierRegarde<T extends { lastActiveAt: number }>(onglets: T[]): T | undefined {
  // À égalité de date, le dernier ouvert l'emporte : deux onglets créés dans la
  // même milliseconde n'ont rien d'autre pour les départager.
  return onglets.reduce<T | undefined>(
    (retenu, onglet) =>
      retenu === undefined || onglet.lastActiveAt >= retenu.lastActiveAt ? onglet : retenu,
    undefined
  )
}
