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

/**
 * L'onglet voisin, en tournant en boucle aux extrémités.
 *
 * C'est ce que fait Contrôle+Tab dans un navigateur : passé le dernier onglet
 * on revient au premier, plutôt que de buter contre le bord.
 */
export function voisin<T extends { id: string }>(
  onglets: T[],
  courant: string | undefined,
  pas: number
): T | undefined {
  if (onglets.length === 0) return undefined
  const rang = onglets.findIndex((o) => o.id === courant)
  // Onglet courant inconnu : on part du premier, ce qui rend « suivant » utile
  // même quand rien n'est encore choisi.
  const depart = rang === -1 ? 0 : rang
  return onglets[(depart + pas + onglets.length) % onglets.length]
}

/**
 * La commande qui relance la conversation d'un onglet qu'on redémarre.
 *
 * Redémarrer détruit la session et tout ce qui y tournait, puis en recrée une au
 * même endroit. Un onglet de conversation doit y retrouver son agent : c'est pour
 * lui qu'on redémarre, le plus souvent quand il ne répond plus ou qu'il doit
 * relire sa configuration.
 *
 * `-r` ne vaut que si Claude Code a déjà écrit le transcrit. Une conversation
 * ouverte à l'instant et jamais sollicitée n'en a pas : `-r` y répondrait
 * « aucune conversation trouvée », alors que `--session-id` la démarre sous
 * l'identifiant que l'onglet porte déjà.
 *
 * Un onglet sans conversation repart sur un shell neuf, et rien d'autre.
 */
export function commandeDeRedemarrage(
  claudeSessionId: string | undefined,
  transcritExiste: boolean
): string | undefined {
  if (!claudeSessionId) return undefined
  return transcritExiste ? `claude -r ${claudeSessionId}` : `claude --session-id ${claudeSessionId}`
}
