/**
 * Quelle touche commande l'application, et comment elle s'écrit.
 *
 * macOS a trois modificateurs et le terminal n'en prend qu'un : Contrôle reste à
 * l'agent, Commande revient à l'application. Ailleurs il n'y a pas de troisième
 * touche, et Contrôle seul appartient déjà au shell — Contrôle+E va en fin de
 * ligne, Contrôle+W efface le mot précédent, Contrôle+T transpose. Les prendre
 * pour l'application les retirerait à l'agent, dans une application qui n'est
 * faite que de terminaux. Contrôle+W est le cas qui tranche : il fermerait
 * l'onglet, et tuerait la session tmux, là où l'utilisateur corrigeait un mot.
 *
 * D'où Contrôle+Majuscule hors de macOS, comme tous les terminaux du bureau
 * Linux — Ctrl+Maj+T pour un onglet, Ctrl+Maj+W pour le fermer.
 */

/** Ce que la décision lit d'un événement clavier. */
export interface Modificateurs {
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
}

/** Vrai quand l'événement porte la combinaison réservée à l'application. */
export function estCommande(evenement: Modificateurs, plateforme: string): boolean {
  // L'exclusion de l'autre modificateur évite de répondre à une combinaison
  // qui en vise une troisième, comme Contrôle+Commande+T sur macOS.
  if (plateforme === 'darwin') return evenement.metaKey && !evenement.ctrlKey
  return evenement.ctrlKey && evenement.shiftKey && !evenement.metaKey
}

/** Le raccourci tel qu'il s'écrit sur la plateforme, pour l'afficher. */
export function libelleRaccourci(touche: string, plateforme: string): string {
  return plateforme === 'darwin' ? `⌘${touche}` : `Ctrl+Maj+${touche}`
}
