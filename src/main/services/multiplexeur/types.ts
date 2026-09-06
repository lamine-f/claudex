import type { IPty } from 'node-pty'

/** Ce qu'on relève d'une session en cours pour pouvoir la reprendre plus tard. */
export interface InfoSession {
  /** Répertoire courant. Vide quand le pilote ne sait pas le lire. */
  cwd: string
  /** Nom du processus au premier plan : `zsh`, `node`, `claude`… */
  commande: string
  /** Terminal du pane. Vide hors des systèmes qui en exposent un. */
  tty: string
}

/** Ce qui doit être joué au lancement d'une session neuve. */
export interface Amorce {
  /** Commande de l'onglet : `claude -r <uuid>`, par exemple. */
  commande?: string
  /** Fichier portant l'écran de la vie précédente, à réafficher avant elle. */
  ecranPrecedent?: string
}

/**
 * Ce que Claudex attend d'un multiplexeur de terminaux.
 *
 * L'interface est née du portage vers Windows, où tmux n'existe pas. Elle n'a
 * pas été inventée : c'est la surface que `tmux.ts` exposait déjà, à trois
 * choses près, chacune imposée par un pilote qui n'a pas de serveur derrière lui.
 *
 * `attacher` remplace l'ancien `attachArgs`. Renvoyer une ligne de commande
 * supposait qu'un client se lance pour rejoindre une session qui existe sans
 * lui ; sur Windows le pty *est* la session, il n'y a rien à rejoindre. Le
 * pilote rend donc le processus, et `pty.ts` ne garde que le registre.
 *
 * `detacher` existe pour la même raison. Détacher un client tmux le tue et la
 * session continue ; tuer un pty ConPTY emporte le shell. Le geste n'a pas le
 * même sens des deux côtés, c'est donc au pilote de le tenir.
 *
 * `assurer` reçoit l'amorce en deux morceaux plutôt qu'une chaîne toute faite.
 * La composer demandait de savoir écrire du shell — `cat -- fichier; commande`
 * ne veut rien dire pour PowerShell — et cette connaissance-là n'a rien à faire
 * dans `ipc/terminal.ts`.
 */
export interface Multiplexeur {
  /** Nom montré à l'utilisateur dans l'écran d'état. */
  readonly nom: string

  /**
   * Vrai quand une session survit à la fermeture de l'application.
   *
   * L'interface le dit plutôt que de le laisser deviner : c'est la promesse
   * principale de Claudex, et un pilote qui ne la tient pas doit l'annoncer
   * à l'écran d'état au lieu de laisser l'utilisateur le découvrir en perdant
   * un agent.
   */
  readonly persistant: boolean

  /** Écrit ce dont le pilote a besoin. Appelé une fois au démarrage. */
  preparerConfiguration(dossier: string): Promise<void>

  /** Version de l'outil sous-jacent, ou `null` s'il est introuvable. */
  version(): Promise<string | null>

  existe(nom: string): Promise<boolean>

  /** Crée la session si besoin, et dit si elle préexistait. */
  assurer(
    nom: string,
    cwd: string,
    cols: number,
    rows: number,
    amorce?: Amorce
  ): Promise<{ preexistante: boolean }>

  /** Ferme la session pour de bon, avec tout ce qui y tourne. */
  detruire(nom: string): Promise<void>

  /** Rend le pty par lequel l'onglet voit la session. */
  attacher(nom: string, cols: number, rows: number): IPty

  /** Défait ce qu'`attacher` a fait, sans toucher à la session. */
  detacher(processus: IPty): void

  /**
   * Donne à la session ses nouvelles dimensions.
   *
   * Redimensionner le pty suffisait tant que personne ne tenait d'écran : tmux
   * tient le sien de son côté, et le pilote ConPTY n'avait qu'un tampon
   * d'octets, que la largeur ne concerne pas. Depuis qu'il compose un écran,
   * celui-ci doit suivre la fenêtre, faute de quoi il garderait pour toujours
   * les dimensions qu'avait l'onglet à sa création.
   */
  redimensionner(nom: string, processus: IPty, cols: number, rows: number): void

  /** Écran et historique visibles, séquences ANSI comprises. */
  capturer(nom: string, lignes?: number): Promise<string>

  info(nom: string): Promise<InfoSession | null>

  /** Ligne de commande complète du processus au premier plan, arguments compris. */
  commandeComplete(info: InfoSession): Promise<string | null>

  /** Protège une chaîne destinée à une ligne de commande du shell du pilote. */
  proteger(valeur: string): string
}
