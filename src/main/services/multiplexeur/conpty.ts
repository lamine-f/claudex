import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir, release } from 'node:os'
import { join } from 'node:path'
import type { IPty } from 'node-pty'
import type { Amorce, InfoSession, Multiplexeur } from './types'

// node-pty est un module natif : il doit être chargé en CommonJS depuis le main.
const require_ = createRequire(import.meta.url)
const nodePty = require_('node-pty') as typeof import('node-pty')

/**
 * Pilote Windows, adossé à ConPTY.
 *
 * Il n'y a pas de serveur derrière lui : la session *est* le pty, et elle meurt
 * avec l'application. C'est la différence qui compte face à tmux, et elle est
 * annoncée par `persistant: false` plutôt que découverte à l'usage.
 *
 * Trois pistes ont été écartées avant d'en arriver là. Passer par WSL rendait la
 * persistance intacte, mais Claudex n'aurait alors vu que les conversations de la
 * distribution Linux : un utilisateur qui a installé Claude Code nativement, ce
 * qui est le cas courant, aurait ouvert une application aveugle à tout son
 * travail. tmux sous MSYS2 ou Cygwin tourne dans une émulation de pty qui n'est
 * pas ConPTY, et les exécutables Windows natifs — `claude.exe` le premier — s'y
 * comportent mal. Écrire un vrai multiplexeur, c'est-à-dire un processus courtier
 * détaché qui possède les pty et parle par tube nommé, reste faisable et
 * souhaitable, mais ce n'est pas un portage.
 *
 * L'écran d'avant est donc ce qui tient lieu de mémoire : il est réaffiché au
 * lancement de la session recréée, exactement comme tmux le fait après un
 * redémarrage de la machine.
 */

interface Session {
  processus: IPty
  /**
   * Fin de la sortie, gardée pour `capturer`.
   *
   * tmux tient l'historique du pane et sait le rendre ; ici personne ne le tient,
   * et sans cette copie une session recréée repartirait d'un écran vide.
   */
  tampon: string[]
  taille: number
}

/** Au-delà, on jette le début. Une capture sert à reconnaître, pas à archiver. */
const TAMPON_MAX = 256 * 1024

const sessions = new Map<string, Session>()

let dossierAmorces = ''

/**
 * Shell des terminaux.
 *
 * PowerShell plutôt que `cmd` : c'est le shell attendu sur Windows 11, et le seul
 * des deux qui sache lire un fichier en UTF-8 sans dépendre de la page de codes
 * de la console — ce dont dépend le réaffichage de l'écran précédent.
 */
function shell(): string {
  const impose = process.env.CLAUDEX_SHELL
  if (impose) return impose

  const pwsh = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe')
  if (existsSync(pwsh)) return pwsh

  return join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
}

/**
 * Environnement des terminaux.
 *
 * L'installateur natif de Claude Code dépose `claude.exe` dans `~/.local/bin`, et
 * n'ajoute ce dossier au PATH qu'à la session Windows suivante. Entre les deux,
 * un shell lancé par Claudex hérite d'un PATH sans lui : la commande d'amorce
 * échoue avec « terme non reconnu », ce qui ne dit pas où chercher. On l'ajoute
 * donc quand le binaire est là.
 */
function environnement(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [clef, valeur] of Object.entries(process.env)) {
    if (valeur !== undefined) env[clef] = valeur
  }

  const local = join(homedir(), '.local', 'bin')
  if (existsSync(join(local, 'claude.exe')) && !env.PATH?.split(';').includes(local)) {
    env.PATH = `${local};${env.PATH ?? ''}`
  }

  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  return env
}

/**
 * Ce que tout terminal de Claudex commence par faire.
 *
 * Une console Windows écrit dans la page de codes du poste, pas en UTF-8 : le
 * tiret cadratin d'un écran réaffiché ressortait en trait d'union, et les traits
 * de cadre dont Claude Code dessine son interface en caractères de remplacement.
 * xterm attend de l'UTF-8, node-pty le décode comme tel : il faut donc le dire à
 * PowerShell, pour ce qu'il écrit lui-même et pour ce qu'il passe aux programmes
 * qu'il lance.
 *
 * L'affectation est protégée : certains hôtes refusent de changer l'encodage
 * d'une console qu'ils ne possèdent pas, et l'échec ne doit pas emporter la
 * session avec lui.
 */
const ENTETE_UTF8 = `try {
  [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
  $OutputEncoding = [Console]::OutputEncoding
} catch {
}`

/** Protège une chaîne destinée à une ligne de commande PowerShell. */
export function proteger(valeur: string): string {
  return `'${valeur.replaceAll("'", "''")}'`
}

/**
 * Ne garde du flux capturé que ce qui se relit.
 *
 * `capture-pane` de tmux rend un écran déjà composé ; ici le tampon est le flux
 * brut sorti du pty, et un flux contient les ordres qui l'ont dessiné. Réafficher
 * tel quel donnait un terminal vide : le shell commence par `ESC[2J`, et rejouer
 * cet effacement emportait tout ce qui venait d'être écrit au-dessus.
 *
 * Les séquences de couleur sont conservées, tout le reste est jeté :
 * déplacements de curseur, effacements, écran alterné, titres de fenêtre. Une
 * barre de progression réaffichée s'étale alors sur plusieurs lignes au lieu de
 * se réécrire sur place — c'est le prix à payer, et il est moindre qu'un écran
 * blanc.
 */
export function lisible(brut: string): string {
  // Les échappements sont écrits en `\u001b` : un caractère d'échappement posé
  // tel quel dans une expression régulière ne se voit pas à la relecture, et une
  // recherche dans le fichier ne le trouve pas.
  const OSC = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g
  // Toutes les séquences CSI sauf celles finissant par `m` : les couleurs restent.
  const CSI_SAUF_COULEURS = /\u001b\[[0-9;?]*[A-Za-ln-z]/g
  // Échappements à deux caractères : jeux de caractères, mode clavier, curseur.
  const ECHAPPEMENTS_COURTS = /\u001b(?:[()][0-9A-Za-z]|[=>78])/g

  return brut
    .replace(OSC, '')
    .replace(CSI_SAUF_COULEURS, '')
    .replace(ECHAPPEMENTS_COURTS, '')
    .replace(/^\s*\n/, '')
}

/**
 * Écrit le script joué au lancement d'une session, et rend son chemin.
 *
 * Passer par un fichier plutôt que par `-Command` évite d'avoir à citer une
 * commande à l'intérieur d'une ligne de commande Windows, où les règles de
 * découpage appartiennent à l'exécutable appelé et non au système. Le premier
 * essai, en `-Command`, perdait les guillemets du `--name` d'une bifurcation.
 *
 * L'écran d'avant est relu par .NET, non par `Get-Content` : celui-ci décode
 * selon la page de codes de la console, qui n'est pas UTF-8 par défaut, et les
 * accents comme les caractères de dessin en ressortaient abîmés.
 */
async function ecrireAmorce(nom: string, amorce: Amorce): Promise<string> {
  const lignes: string[] = [ENTETE_UTF8]
  if (amorce.ecranPrecedent) {
    lignes.push(
      `[Console]::Out.Write([IO.File]::ReadAllText(${proteger(amorce.ecranPrecedent)}, [Text.Encoding]::UTF8))`
    )
  }
  if (amorce.commande) lignes.push(amorce.commande)

  await mkdir(dossierAmorces, { recursive: true })
  const chemin = join(dossierAmorces, `${nom}.ps1`)
  // La marque d'ordre des octets n'est pas décorative : Windows PowerShell 5.1
  // lit un `.ps1` sans elle dans la page de codes ANSI du poste, et l'accent
  // d'un titre de bifurcation faisait alors échouer l'analyse du script.
  await writeFile(chemin, `﻿${lignes.join('\n')}\n`, 'utf8')
  return chemin
}

async function oublierAmorce(nom: string): Promise<void> {
  if (!dossierAmorces) return
  await rm(join(dossierAmorces, `${nom}.ps1`), { force: true }).catch(() => undefined)
}

export const pilote: Multiplexeur = {
  nom: 'ConPTY',
  persistant: false,

  async preparerConfiguration(dossier) {
    dossierAmorces = join(dossier, 'amorces')
    // Les scripts d'une exécution précédente ne valent plus rien : leurs sessions
    // sont mortes avec elle, et les relire relancerait des agents sans onglet.
    await rm(dossierAmorces, { recursive: true, force: true }).catch(() => undefined)
    await mkdir(dossierAmorces, { recursive: true }).catch(() => undefined)
  },

  // ConPTY fait partie du système : sa version utile est celle de Windows.
  version: () => Promise.resolve(release()),

  existe: (nom) => Promise.resolve(sessions.has(nom)),

  async assurer(nom, cwd, cols, rows, amorce) {
    if (sessions.has(nom)) return { preexistante: true }

    // Toute session passe par un script, même sans commande à jouer : c'est lui
    // qui met la console en UTF-8, et un terminal qui s'en passerait afficherait
    // l'interface de Claude Code en caractères de remplacement.
    const script = await ecrireAmorce(nom, amorce ?? {})
    // `-NoExit` rend la main à un shell interactif quand le script se termine,
    // pour que la session survive à la sortie de l'agent. C'est l'équivalent du
    // `exec $SHELL -l` que le pilote tmux met au bout de son amorce.
    const args = ['-NoLogo', '-NoProfile', '-NoExit', '-File', script]

    const processus = nodePty.spawn(shell(), args, {
      name: 'xterm-256color',
      cols: Math.max(cols, 20),
      rows: Math.max(rows, 5),
      cwd,
      env: environnement(),
      useConpty: true
    })

    const session: Session = { processus, tampon: [], taille: 0 }
    processus.onData((donnees) => {
      session.tampon.push(donnees)
      session.taille += donnees.length
      while (session.taille > TAMPON_MAX && session.tampon.length > 1) {
        session.taille -= session.tampon.shift()!.length
      }
    })
    processus.onExit(() => {
      // Ne retirer l'entrée que si elle désigne encore CE processus : une
      // fermeture d'onglet suivie d'une réouverture immédiate rejouerait sinon
      // la sortie de l'ancien sur le dos du nouveau.
      if (sessions.get(nom) === session) sessions.delete(nom)
      void oublierAmorce(nom)
    })

    sessions.set(nom, session)
    return { preexistante: false }
  },

  async detruire(nom) {
    const session = sessions.get(nom)
    sessions.delete(nom)
    try {
      session?.processus.kill()
    } catch {
      /* déjà mort */
    }
    await oublierAmorce(nom)
  },

  attacher(nom, cols, rows) {
    const session = sessions.get(nom)
    if (!session) throw new Error(`Session inconnue : ${nom}`)
    try {
      session.processus.resize(Math.max(cols, 20), Math.max(rows, 5))
    } catch {
      // Le pty peut disparaître entre l'attachement et son traitement.
    }
    return session.processus
  },

  // Le pty est la session : le tuer ici fermerait le shell d'un onglet qu'on
  // voulait seulement mettre de côté. Il n'y a donc rien à défaire.
  detacher: () => undefined,

  capturer(nom, lignes = 5000) {
    const session = sessions.get(nom)
    if (!session) return Promise.resolve('')
    const contenu = lisible(session.tampon.join(''))
    // Le tampon est une suite d'octets, pas de lignes : on le recoupe à la
    // demande pour tenir la même promesse que `capture-pane -S -<lignes>`.
    const coupees = contenu.split('\n')
    return Promise.resolve(coupees.slice(Math.max(0, coupees.length - lignes)).join('\n'))
  },

  info(nom) {
    const session = sessions.get(nom)
    if (!session) return Promise.resolve(null)
    // ConPTY donne le nom du processus au premier plan, jamais son répertoire :
    // `cwd` reste vide et l'appelant garde celui qu'il avait.
    return Promise.resolve<InfoSession>({ cwd: '', commande: session.processus.process, tty: '' })
  },

  // Retrouver la ligne de commande complète demanderait d'interroger WMI pour
  // chaque onglet toutes les trente secondes. Le jeu n'en vaut pas la chandelle :
  // seule la bannière de reprise s'en sert, et elle sait se passer de la commande.
  commandeComplete: () => Promise.resolve(null),

  proteger
}
