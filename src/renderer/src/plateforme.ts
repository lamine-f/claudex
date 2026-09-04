import { estCommande, libelleRaccourci, type Modificateurs } from '@shared/plateforme'

/**
 * La plateforme, lue une fois pour toutes au chargement.
 *
 * Le pont la donne de façon synchrone, à la différence du reste de sa surface :
 * la barre du haut et les libellés des raccourcis en dépendent au premier rendu,
 * et un aller-retour asynchrone les ferait sauter sous les yeux.
 *
 * Le repli couvre le preload d'une version antérieure, que le développement
 * garde en place jusqu'au redémarrage complet d'Electron. Il vaut mieux qu'une
 * plateforme indéfinie, qui donnerait `undefined` à chaque comparaison.
 */
export const PLATEFORME: string = window.claudex?.plateforme ?? 'linux'

export const estMac = PLATEFORME === 'darwin'

/** Vrai quand l'événement porte la combinaison réservée à l'application. */
export const estRaccourci = (evenement: Modificateurs): boolean =>
  estCommande(evenement, PLATEFORME)

/** Un raccourci tel qu'il s'écrit ici, pour l'afficher à l'utilisateur. */
export const raccourci = (touche: string): string => libelleRaccourci(touche, PLATEFORME)
