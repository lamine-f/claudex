import { raccourci as libelle } from '@shared/raccourcis'

/**
 * Le système, lu une fois pour toutes.
 *
 * L'interface ne s'en sert qu'aux endroits où la forme appartient au système et
 * non à l'application : la place des boutons de fenêtre, et la touche des
 * raccourcis. Partout ailleurs, ce qui est dessiné est le même.
 *
 * Le repli sur `darwin` couvre le seul cas où le pont peut ne pas répondre — un
 * preload pas encore rechargé, en développement — et rend alors l'interface
 * d'avant le portage plutôt qu'une interface au hasard.
 */
export const PLATEFORME: NodeJS.Platform = window.claudex.systeme?.plateforme() ?? 'darwin'

export const SUR_MAC = PLATEFORME === 'darwin'

/** Libellé d'un raccourci d'application, pour la plateforme courante. */
export const raccourci = (touche: string): string => libelle(PLATEFORME, touche)
