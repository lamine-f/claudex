import type { ServiceVu } from '@shared/types'

/**
 * Une vue posée sur l'écran du terminal.
 *
 * Une vue et un onglet ne sont pas de même nature. Un onglet *est* la session
 * qu'il porte, et le fermer tue l'agent qui y travaille. Une vue n'est qu'un
 * regard posé sur quelque chose qui existe ailleurs, et la fermer ne touche à
 * rien. Le journal d'un service continue de s'écrire, le fichier reste sur le
 * disque.
 *
 * Le genre est porté par la vue elle-même plutôt que par une liste séparée. Le
 * mécanisme n'a longtemps connu que les journaux, et le store portait
 * `journaux` et `journalActif` en clair. Ajouter le diff par-dessus aurait
 * demandé une seconde paire, puis une troisième pour la vue suivante.
 */
export type Vue = { id: string; titre: string } & (
  | { genre: 'journal'; chemin: string }
  | { genre: 'diff'; depot: string; nomDepot: string; fichier: string; indexe: boolean; nonSuivi: boolean }
)

/**
 * La vue du journal d'un service.
 *
 * L'identité est celle du service : rouvrir le même journal revient dessus au
 * lieu d'en empiler une copie.
 */
export const vueJournal = (service: ServiceVu): Vue => ({
  id: `journal:${service.nom}`,
  titre: service.nom,
  genre: 'journal',
  chemin: service.journal
})

/**
 * La vue du diff d'un fichier.
 *
 * Deux vues distinctes pour le même fichier selon le côté regardé : ce que
 * l'index porte face à HEAD, ou ce que la copie de travail porte face à
 * l'index. Ce sont deux diffs différents, et les confondre en cacherait un.
 */
export const vueDiff = (
  depot: string,
  nomDepot: string,
  fichier: string,
  options: { indexe: boolean; nonSuivi: boolean }
): Vue => ({
  id: `diff:${options.indexe ? 'index' : 'travail'}:${depot}:${fichier}`,
  titre: fichier.split('/').pop() ?? fichier,
  genre: 'diff',
  depot,
  nomDepot,
  fichier,
  indexe: options.indexe,
  nonSuivi: options.nonSuivi
})
