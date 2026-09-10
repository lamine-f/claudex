import { execFile } from 'node:child_process'
import { createConnection } from 'node:net'
import { promisify } from 'node:util'
import { access, mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parse } from 'yaml'
import { resoudre, vagues, type Declaration, type Reproche, type Service } from '@shared/services'
import type { EtatService, ServiceVu } from '@shared/types'
import { multiplexeur } from './multiplexeur'

const run = promisify(execFile)

/** Le fichier que lit Claudex, et le dossier où il verse les journaux. */
export const FICHIER = join('.claudex', 'services.yml')
const JOURNAUX = join('.claudex', 'logs')

/**
 * Au-delà, le journal bascule en `.log.1`.
 *
 * La trace du démarrage est ainsi conservée le temps d'un cycle, et c'est
 * souvent elle qui porte la pile d'erreur d'un service qui n'a pas voulu
 * partir. Un agent qui lirait deux cents mégaoctets ne s'en remettrait pas.
 */
const TAILLE_MAX = 10 * 1024 * 1024

/** Dimensions données à la session d'un service, que personne ne regarde. */
const COLONNES = 160
const LIGNES = 48

/**
 * Nom de session d'un service.
 *
 * Le préfixe le sépare des onglets, nommés `cdx_`. Un service n'est pas une
 * conversation : il ne doit jamais se retrouver dans la barre d'onglets, et
 * un nom distinct rend la confusion impossible plutôt qu'improbable.
 *
 * tmux traite `.` et `:` comme des séparateurs de cible : le nom est donc
 * réduit à ce qui ne l'embarrasse pas. Réduire seul ferait toutefois collisionner
 * deux noms distincts, « front public » et « frontpublic » donnant le même, et
 * démarrer l'un piloterait l'autre. Une empreinte du nom d'origine est donc
 * ajoutée dès qu'il a fallu le réduire. Un nom déjà propre garde le sien, pour
 * que les sessions ouvertes avant ce jour se retrouvent.
 */
export function nomSession(workspaceId: string, service: string): string {
  return `svc_${sur(workspaceId)}_${sur(service)}`
}

/** Un nom que tmux accepte, qui reste propre à celui dont il vient. */
function sur(valeur: string): string {
  const reduit = valeur.replace(/[^a-zA-Z0-9]/g, '')
  return reduit === valeur ? reduit : `${reduit}${empreinte(valeur)}`
}

/**
 * Quatre caractères tirés du nom entier.
 *
 * Assez pour séparer les quelques services d'un projet, et assez courts pour
 * que le nom de session reste lisible dans un `tmux ls`.
 */
function empreinte(valeur: string): string {
  let somme = 0
  for (let i = 0; i < valeur.length; i++) somme = (somme * 31 + valeur.charCodeAt(i)) >>> 0
  return somme.toString(36).padStart(4, '0').slice(-4)
}

export function cheminJournal(projet: string, service: string): string {
  return join(projet, JOURNAUX, `${service}.log`)
}

/** Lit la déclaration du projet. Un projet sans fichier n'est pas une erreur. */
export async function charger(
  projet: string
): Promise<{ services: Service[]; reproches: Reproche[] }> {
  const texte = await readFile(join(projet, FICHIER), 'utf8').catch(() => null)
  if (texte === null) return { services: [], reproches: [] }

  let declaration: Declaration
  try {
    declaration = (parse(texte) ?? {}) as Declaration
  } catch (erreur) {
    return {
      services: [],
      reproches: [{ message: `Le fichier ne se lit pas : ${(erreur as Error).message}` }]
    }
  }

  const resolu = resoudre(declaration)

  /*
   * Un dossier qui n'existe pas se dit ici, et non au lancement.
   *
   * tmux ne refuse pas une session dont le dossier est absent : il repart du
   * dossier personnel. La commande s'exécute alors ailleurs, et le message qui
   * en sort parle d'autre chose — mesuré sur un `npm start` qui cherchait un
   * `package.json` dans le dossier de l'utilisateur, quatre fois de suite, sans
   * que rien à l'écran ne dise pourquoi.
   */
  await Promise.all(
    resolu.services.map(async (service) => {
      const cible = join(projet, service.dossier)
      const existe = await access(cible).then(
        () => true,
        () => false
      )
      if (!existe) {
        resolu.reproches.push({
          service: service.nom,
          message: `Son dossier est introuvable : ${cible}`
        })
      }
    })
  )

  return resolu
}

/** Vrai si quelque chose écoute sur ce port. */
function ecoute(port: number): Promise<boolean> {
  return new Promise((resoudre) => {
    const prise = createConnection({ host: '127.0.0.1', port })
    const conclure = (reponse: boolean): void => {
      prise.destroy()
      resoudre(reponse)
    }
    prise.setTimeout(400)
    prise.once('connect', () => conclure(true))
    prise.once('timeout', () => conclure(false))
    prise.once('error', () => conclure(false))
  })
}

/**
 * L'état d'un service.
 *
 * Il ne se lit pas sur le processus. `docker compose up -d` rend la main
 * aussitôt et les conteneurs tournent ; un service lancé hors de Claudex vit
 * sans que l'application ait de session pour lui. Le port fait donc foi quand
 * il y en a un, et la session ne dit que ce qu'elle sait : si Claudex l'a
 * lancé, et s'il tourne encore.
 */
export async function etat(
  workspaceId: string,
  service: Service
): Promise<{ etat: EtatService; notre: boolean }> {
  const notre = await multiplexeur.existe(nomSession(workspaceId, service.nom))
  const debout = service.port !== undefined ? await ecoute(service.port) : notre

  if (debout) return { etat: notre || !service.port ? 'vivant' : 'dehors', notre }
  // Une session qui vit sans que le port réponde est un service qui démarre,
  // ou qui a échoué sans rendre la main. Les distinguer demanderait de lire son
  // journal ; on dit « démarrage » et l'utilisateur ouvre la fenêtre.
  return { etat: notre ? 'demarrage' : 'arrete', notre }
}

export async function etats(workspaceId: string, projet: string): Promise<ServiceVu[]> {
  const { services, reproches } = await charger(projet)
  return Promise.all(
    services.map(async (service) => {
      const { etat: quel, notre } = await etat(workspaceId, service)
      return {
        nom: service.nom,
        groupe: service.groupe,
        port: service.port,
        detache: service.detache,
        depend_de: service.depend_de,
        etat: quel,
        notre,
        journal: cheminJournal(projet, service.nom),
        reproche: reproches.find((r) => r.service === service.nom)?.message
      }
    })
  )
}

/** Fait basculer le journal quand il a trop grossi. */
async function fairePlace(fichier: string): Promise<void> {
  const infos = await stat(fichier).catch(() => null)
  if (infos && infos.size > TAILLE_MAX) {
    await rename(fichier, `${fichier}.1`).catch(() => undefined)
  }
}

/**
 * Démarre un service, et met sa sortie dans un fichier.
 *
 * Le fichier est le même que celui qu'un agent lira. Une seule source, trois
 * lecteurs : la fenêtre de suivi, l'agent, et l'écran de la session si on
 * l'ouvre.
 */
export async function demarrer(
  workspaceId: string,
  projet: string,
  service: Service
): Promise<void> {
  // Lancer depuis un dossier absent revient à lancer depuis le dossier
  // personnel : tmux ne refuse pas, il se rabat. Mieux vaut ne rien faire.
  const cwdVoulu = join(projet, service.dossier)
  const existe = await access(cwdVoulu).then(
    () => true,
    () => false
  )
  if (!existe) return

  const journal = cheminJournal(projet, service.nom)
  await mkdir(join(projet, JOURNAUX), { recursive: true })
  await fairePlace(journal)

  const session = nomSession(workspaceId, service.nom)

  /*
   * Un port déjà tenu par un autre arrête tout ici.
   *
   * Sans cette garde, la commande part quand même et se heurte au port pris.
   * Mesuré sur un `ng serve` : il demande alors « Port 4200 is already in use.
   * Would you like to use a different port ? » et attend une réponse que
   * personne ne donne. Le service restait « démarre » pour toujours, et rien à
   * l'écran ne disait pourquoi — il fallait ouvrir le journal pour le savoir.
   *
   * L'appelant n'a rien à décider : l'état passera à « hors Claudex », qui
   * propose déjà de reprendre le port ou de le libérer.
   */
  if (service.port !== undefined && !(await multiplexeur.existe(session))) {
    if (await ecoute(service.port)) return
  }

  const cwd = cwdVoulu
  // Le journal part avec l'amorce, non après : c'est le pilote qui sait
  // brancher le tuyau avant que la commande ne parte, et l'ordre inverse
  // perdrait la trace de démarrage.
  await multiplexeur.assurer(session, cwd, COLONNES, LIGNES, {
    commande: service.commande,
    env: service.env,
    journal,
    // Un service se lance comme si on l'avait tapé soi-même : sans
    // l'environnement de connexion, `./mvnw` ne trouve pas le JDK que le
    // profil de l'utilisateur installe.
    connexion: true
  })
}

export async function arreter(workspaceId: string, service: Service): Promise<void> {
  const session = nomSession(workspaceId, service.nom)
  await multiplexeur.journaliser(session, null).catch(() => undefined)
  await multiplexeur.detruire(session).catch(() => undefined)
}

/**
 * Démarre plusieurs services dans l'ordre de leurs dépendances.
 *
 * Chaque vague part d'un bloc, et l'on attend que ses ports répondent avant la
 * suivante. Sans cette attente, les dix services back partiraient avant que
 * Consul ne soit debout, et se déclareraient dans le vide.
 */
export async function demarrerPlusieurs(
  workspaceId: string,
  projet: string,
  noms: string[],
  attendre = 60_000
): Promise<{ bloques: string[] }> {
  const { services } = await charger(projet)
  const voulus = services.filter((s) => noms.includes(s.nom))
  const { ordre, bloques } = vagues(voulus)

  for (const vague of ordre) {
    await Promise.all(vague.map((service) => demarrer(workspaceId, projet, service)))
    const aAttendre = vague.filter((s) => s.port !== undefined)
    if (aAttendre.length === 0) continue

    const limite = Date.now() + attendre
    while (Date.now() < limite) {
      const prets = await Promise.all(aAttendre.map((s) => ecoute(s.port!)))
      if (prets.every(Boolean)) break
      await new Promise((suite) => setTimeout(suite, 500))
    }
  }

  return { bloques: bloques.map((s) => s.nom) }
}

/**
 * Qui écoute sur ce port.
 *
 * `lsof` sur les systèmes POSIX, `netstat` sur Windows. Rien de tout cela n'est
 * garanti présent : un système qui ne répond pas rend une liste vide, et le
 * bouton dira simplement qu'il n'a trouvé personne.
 */
async function occupants(port: number): Promise<number[]> {
  if (process.platform === 'win32') {
    const { stdout } = await run('netstat', ['-ano', '-p', 'tcp']).catch(() => ({ stdout: '' }))
    return [
      ...new Set(
        stdout
          .split('\n')
          .filter((l) => /LISTENING/i.test(l) && new RegExp(`[:.]${port}\\s`).test(l))
          .map((l) => Number(l.trim().split(/\s+/).at(-1)))
          .filter((n) => Number.isInteger(n) && n > 0)
      )
    ]
  }

  const { stdout } = await run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']).catch(() => ({
    stdout: ''
  }))
  return [...new Set(stdout.split('\n').map(Number).filter((n) => Number.isInteger(n) && n > 0))]
}

export async function liberer(projet: string, nom: string): Promise<number[]> {
  const { services } = await charger(projet)
  const service = services.find((s) => s.nom === nom)
  if (!service?.port) return []

  const pids = await occupants(service.port)
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* déjà parti */
    }
  }

  // Laisser le temps de s'arrêter proprement avant d'insister.
  await new Promise((suite) => setTimeout(suite, 1500))
  for (const pid of pids) {
    if (!(await ecoute(service.port))) break
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* déjà parti */
    }
  }

  /*
   * On ne rend la main qu'une fois le port réellement libre.
   *
   * Un processus tué ne lâche pas sa prise à l'instant même. « Reprendre »
   * enchaînait alors sur un démarrage que la garde du port refusait, le port
   * répondant encore : le service restait arrêté, et le geste paraissait sans
   * effet.
   */
  const limite = Date.now() + 5000
  while (Date.now() < limite) {
    if (!(await ecoute(service.port))) break
    await new Promise((suite) => setTimeout(suite, 200))
  }
  return pids
}

/** Ce qu'on lit au plus dans un journal, avant de le découper en lignes. */
const QUEUE_MAX = 2 * 1024 * 1024

/**
 * Les dernières lignes du journal d'un service, filtrées.
 *
 * Seule la fin du fichier est lue. Un service Java écrit vite, et rendre cent
 * mille lignes pour en montrer deux cents coûterait à celui qui les lit autant
 * qu'à celui qui les cherche.
 *
 * Rend `null` quand le service n'est pas déclaré, ce qui n'est pas la même
 * chose qu'un journal vide.
 */
export async function lireJournal(
  projet: string,
  nom: string,
  options: { lignes?: number; motif?: string } = {}
): Promise<string | null> {
  const { services } = await charger(projet)
  if (!services.some((s) => s.nom === nom)) return null

  const fichier = cheminJournal(projet, nom)
  const infos = await stat(fichier).catch(() => null)
  if (!infos) return ''

  const depuis = Math.max(0, infos.size - QUEUE_MAX)
  const poignee = await open(fichier, 'r')
  try {
    const tampon = Buffer.alloc(infos.size - depuis)
    await poignee.read(tampon, 0, tampon.length, depuis)
    let lignes = tampon.toString('utf8').split('\n')
    // La première ligne est coupée quand on n'a pas lu depuis le début.
    if (depuis > 0) lignes = lignes.slice(1)

    if (options.motif) {
      const terme = options.motif.toLowerCase()
      lignes = lignes.filter((l) => l.toLowerCase().includes(terme))
    }
    return lignes.slice(-(options.lignes ?? 200)).join('\n').trim()
  } finally {
    await poignee.close()
  }
}

/**
 * Dit à Claude Code où joindre le serveur MCP de Claudex.
 *
 * L'entrée pointe vers le serveur que l'application porte déjà, sur la boucle
 * locale, avec le jeton qui l'autorise. Un serveur lancé par conversation
 * pesait quatre-vingt-huit mégaoctets, cinq conversations en faisant quatre
 * cent quarante : ici le coût est nul.
 *
 * Pour tous les projets, l'entrée va dans la configuration de l'utilisateur et
 * aucun dépôt n'est touché. Le projet visé se dit alors à chaque outil, et sans
 * cela c'est celui qu'on regarde dans l'application.
 *
 * Pour un seul, un `.mcp.json` est écrit dans le projet. Il y devient un
 * fichier de plus à commiter ou à ignorer, ce qui vaut quand on veut que
 * l'équipe l'ait aussi.
 *
 * Le fichier appartient à qui le porte, non à Claudex : ce qui s'y trouve déjà
 * est gardé, et une copie est mise de côté avant d'écrire. Seule l'entrée
 * `claudex` est posée ou remplacée.
 */
export async function ecrireMcp(
  projet: string,
  ou: { adresse: string; jeton: string; portee: 'projet' | 'utilisateur'; maison: string }
): Promise<string> {
  // Pour tous les projets, l'entrée va dans la configuration de l'utilisateur
  // et ne fige pas de projet : le serveur le déduit du dossier où l'agent
  // tourne. Rien n'est alors écrit dans les dépôts.
  const fichier =
    ou.portee === 'utilisateur' ? join(ou.maison, '.claude.json') : join(projet, '.mcp.json')

  let existant: Record<string, unknown> = {}
  const texte = await readFile(fichier, 'utf8').catch(() => null)
  if (texte !== null) {
    try {
      existant = JSON.parse(texte) as Record<string, unknown>
      await writeFile(`${fichier}.avant`, texte)
    } catch {
      // Un JSON illisible ne doit pas être écrasé sans trace : on le garde à
      // côté et l'on repart d'un fichier propre.
      await writeFile(`${fichier}.avant`, texte)
      existant = {}
    }
  }

  const serveurs = (existant.mcpServers ?? {}) as Record<string, unknown>
  const contenu = {
    ...existant,
    mcpServers: {
      ...serveurs,
      claudex: {
        type: 'http',
        url: ou.adresse,
        headers: { Authorization: `Bearer ${ou.jeton}` }
      }
    }
  }

  await writeFile(fichier, `${JSON.stringify(contenu, null, 2)}\n`)
  return fichier
}

/**
 * Remet à jour les configurations qui pointent vers l'ancienne adresse.
 *
 * Le port change quand celui qu'on retenait est pris, et la configuration
 * écrite hier devient alors fausse. Sans cette reprise, il faudrait recliquer
 * le bouton après chaque changement, et l'on ne saurait même pas qu'il le faut :
 * l'agent dirait seulement que le serveur ne répond pas.
 *
 * Seules les entrées déjà posées sont touchées. Rien n'est créé ici.
 */
export async function rafraichirMcp(
  ou: { adresse: string; jeton: string; maison: string },
  projets: string[]
): Promise<string[]> {
  const fichiers = [join(ou.maison, '.claude.json'), ...projets.map((p) => join(p, '.mcp.json'))]
  const repris: string[] = []

  for (const fichier of fichiers) {
    const texte = await readFile(fichier, 'utf8').catch(() => null)
    if (texte === null) continue

    let contenu: Record<string, unknown>
    try {
      contenu = JSON.parse(texte) as Record<string, unknown>
    } catch {
      continue
    }

    const serveurs = contenu.mcpServers as Record<string, Record<string, unknown>> | undefined
    const entree = serveurs?.claudex
    if (!entree || (entree.url === ou.adresse && aLeJeton(entree, ou.jeton))) continue

    entree.type = 'http'
    entree.url = ou.adresse
    entree.headers = { Authorization: `Bearer ${ou.jeton}` }
    await writeFile(fichier, `${JSON.stringify(contenu, null, 2)}\n`)
    repris.push(fichier)
  }

  return repris
}

/** Vrai quand l'entrée porte déjà le bon jeton. */
function aLeJeton(entree: Record<string, unknown>, jeton: string): boolean {
  const entetes = entree.headers as Record<string, string> | undefined
  return entetes?.Authorization === `Bearer ${jeton}`
}

/** Ce qu'un projet neuf trouve dans son `services.yml`, à remplir. */
const MODELE = `# Les services de ce projet, tels que Claudex les lance.
#
# Les chemins sont relatifs à ce fichier, qui vit à la racine du projet.
# Ce que Claudex verse dans .claudex/logs/, les agents le lisent.

# Ce dont un service tient ses réglages. Nommé, donc cité par qui veut.
modeles:
  spring:
    commande: ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
    sante: http://localhost:{port}/actuator/health
    depend_de: [infra]
  angular:
    commande: npm start

# Le groupe ne dit que l'endroit où le service s'affiche. Deux services qui se
# lancent autrement peuvent rester dans la même famille.
services:
  # Une infrastructure rend la main sans s'arrêter : \`detache\` le dit, sans quoi
  # elle paraîtrait éteinte alors qu'elle tourne.
  - { nom: infra, commande: docker compose up -d, detache: true }

  # - { nom: coeur, modele: spring,  groupe: back,  port: 8081, dossier: mon_service }
  # - { nom: front, modele: angular, groupe: front, port: 4200, dossier: mon_front }
`

/**
 * Pose un modèle de déclaration à la racine du projet.
 *
 * Un fichier vide devant soi ne dit pas ce qu'on peut y écrire. Celui-ci porte
 * les deux formes qu'on utilise ici, un service Spring et un front Angular, et
 * l'infrastructure détachée qui les précède.
 *
 * Un fichier déjà là n'est jamais touché : ce serait effacer une déclaration
 * qui marche pour la remplacer par un exemple.
 */
export async function ecrireModele(projet: string): Promise<string | null> {
  const fichier = join(projet, FICHIER)
  const existe = await access(fichier).then(
    () => true,
    () => false
  )
  if (existe) return null

  await mkdir(dirname(fichier), { recursive: true })
  await writeFile(fichier, MODELE)
  return fichier
}
