import { pilote as conpty } from './conpty'
import { pilote as tmux } from './tmux'
import type { Multiplexeur } from './types'

export type { Amorce, InfoSession, Multiplexeur } from './types'

/**
 * Le pilote de la plateforme courante.
 *
 * C'est le seul endroit de l'application où le système est interrogé pour choisir
 * un terminal. Le reste du code parle à `multiplexeur` sans savoir ce qu'il y a
 * derrière, ce qui était déjà vrai de tmux avant le portage.
 */
export const multiplexeur: Multiplexeur = process.platform === 'win32' ? conpty : tmux
