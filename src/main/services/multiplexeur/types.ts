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
  /**
   * Variables d'environnement à poser avant la commande.
   *
   * Elles sont composées par le pilote et non par l'appelant : `A=1 commande`
   * ne veut rien dire pour PowerShell, qui écrit `$env:A='1'`. C'est la même
   * raison qui a fait passer l'amorce en morceaux plutôt qu'en chaîne toute
   * faite.
   */
  env?: Record<string, string>

  /**
   * Fichier où dupliquer la sortie, branché avant que la commande ne parte.
   *
   * L'ordre compte : brancher après le lancement perd tout ce que le service a
   * écrit dans l'intervalle, c'est-à-dire sa trace de démarrage, celle-là même
   * qu'on veut garder. Mesuré sur un service qui n'écrit qu'une ligne : elle
   * n'arrivait jamais dans le fichier.
   */
  journal?: string

  /**
   * Joue la commande dans un shell de connexion, avec l'environnement de
   * l'utilisateur.
   *
   * Un service lancé sans lui ne voit que le PATH du système. Mesuré : `./mvnw`
   * trouvait `/usr/bin/java`, l'ébauche que macOS livre, et répondait « Unable
   * to locate a Java Runtime » — le vrai JDK et `JAVA_HOME` venaient d'un
   * `.zprofile`, que seuls les shells de connexion lisent. Le même écart vaut
   * pour nvm, sdkman ou pyenv.
   */
  connexion?: boolean
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

  /**
   * Duplique la sortie de la session dans un fichier, sans rien retirer de
   * l'écran. `null` arrête la duplication.
   *
   * C'est par là qu'un agent lit les journaux d'un service : il ouvre un
   * fichier, ce qu'il sait déjà faire, plutôt qu'un protocole qu'il faudrait
   * lui apprendre. Le même flux nourrit donc l'écran, la fenêtre de suivi et
   * l'agent, et personne ne voit un état différent d'un autre.
   */
  journaliser(nom: string, fichier: string | null): Promise<void>

  /** Écran et historique visibles, séquences ANSI comprises. */
  capturer(nom: string, lignes?: number): Promise<string>

  info(nom: string): Promise<InfoSession | null>

  /** Ligne de commande complète du processus au premier plan, arguments compris. */
  commandeComplete(info: InfoSession): Promise<string | null>

  /** Protège une chaîne destinée à une ligne de commande du shell du pilote. */
  proteger(valeur: string): string
}
