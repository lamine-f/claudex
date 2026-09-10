import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { parse } from 'yaml'
import {
  estModifie,
  estNonSuivi,
  lireDeclaration,
  lireStatut,
  type DeclarationGit,
  type Reproche
} from '@shared/git'
import { construirePrompt, nettoyer, tronquer, type Apport } from '@shared/message-commit'
import type { DepotGit, EtatGit } from '@shared/types'
import { binaireClaude } from '../util/paths'

const run = promisify(execFile)

/** Au-delà, on cesse de chercher : un projet n'a pas cent dépôts sous la main. */
const PLAFOND = 60

/** Le fichier par lequel un projet dit quels dépôts suivre. Facultatif. */
export const DECLARATION = join('.claudex', 'git.yml')

/**
 * Les dépôts d'un projet, déclarés ou trouvés.
 *
 * Le fichier `.claudex/git.yml` prime quand il existe et nomme des dépôts. Il
 * sert dans les deux sens : ne suivre que cinq des seize dépôts
 * d'olive_services, ou aller chercher un dépôt que la recherche à un niveau ne
 * trouve pas.
 *
 * Sans lui, la règle d'avant tient. Si le dossier du projet porte un `.git`,
 * il est le dépôt et il est seul ; sinon ses enfants directs sont examinés.
 * C'est ainsi que sont rangés `olive_services` et `web_clients`, qui ne sont
 * pas des dépôts mais en contiennent seize et deux.
 *
 * La recherche ne descend jamais plus bas. C'est instantané, et cela évite par
 * construction de tomber sur les `.git` que des dépendances traînent parfois
 * dans `node_modules`. Un dépôt plus profond se déclare.
 *
 * `.git` peut être un fichier plutôt qu'un dossier : c'est le cas des
 * sous-modules et des arbres de travail liés. Le test porte donc sur
 * l'existence, jamais sur le type.
 */
export async function depots(chemin: string): Promise<{
  racines: string[]
  reproches: Reproche[]
}> {
  const declare = await lireFichier(chemin)
  if (declare.chemins.length > 0 || declare.reproches.length > 0) {
    return verifierDeclares(chemin, declare)
  }
  return { racines: await chercher(chemin), reproches: [] }
}

/** Lit `.claudex/git.yml`. Un projet sans fichier n'est pas une erreur. */
async function lireFichier(projet: string): Promise<{ chemins: string[]; reproches: Reproche[] }> {
  const texte = await readFile(join(projet, DECLARATION), 'utf8').catch(() => null)
  if (texte === null) return { chemins: [], reproches: [] }

  try {
    return lireDeclaration((parse(texte) ?? {}) as DeclarationGit)
  } catch (erreur) {
    return {
      chemins: [],
      reproches: [{ message: `Le fichier ne se lit pas : ${(erreur as Error).message}` }]
    }
  }
}

/**
 * Résout les chemins déclarés et écarte ceux qui ne mènent à aucun dépôt.
 *
 * Un chemin qui ne tient pas se dit plutôt que de disparaître : sans cela, une
 * faute de frappe dans le fichier laisserait la page silencieusement
 * incomplète.
 */
async function verifierDeclares(
  projet: string,
  declare: { chemins: string[]; reproches: Reproche[] }
): Promise<{ racines: string[]; reproches: Reproche[] }> {
  const reproches = [...declare.reproches]
  const racines: string[] = []

  for (const relatif of declare.chemins) {
    const absolu = resolve(projet, relatif)
    if (!(await existe(absolu))) {
      reproches.push({ chemin: relatif, message: 'Dossier introuvable.' })
      continue
    }
    if (!(await existe(join(absolu, '.git')))) {
      reproches.push({ chemin: relatif, message: 'Ce dossier n’est pas un dépôt git.' })
      continue
    }
    racines.push(absolu)
  }

  return { racines, reproches }
}

/** La recherche d'avant : le projet lui-même, ou ses enfants directs. */
async function chercher(chemin: string): Promise<string[]> {
  if (await existe(join(chemin, '.git'))) return [chemin]

  let entrees: string[]
  try {
    entrees = (await readdir(chemin, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }

  const trouves: string[] = []
  for (const nom of entrees.slice(0, 400)) {
    if (trouves.length >= PLAFOND) break
    const sous = join(chemin, nom)
    if (await existe(join(sous, '.git'))) trouves.push(sous)
  }
  return trouves
}

/**
 * L'état d'un dépôt, en une seule commande.
 *
 * `--porcelain=v2` donne l'amont et l'écart avec lui, ce que le v1 tait. `-z`
 * met les chemins à l'abri : un nom peut contenir un espace ou un accent, et
 * sans lui git les rend entre guillemets avec des séquences octales.
 *
 * `-uall` demande les fichiers non suivis un par un. Sans lui, git replie un
 * dossier entier en une seule ligne `? src/`, qui n'est pas un fichier : on ne
 * saurait ni ce qu'il contient, ni quoi cocher. Le coût est nul en pratique,
 * puisque git ne descend pas dans ce que `.gitignore` écarte. Mesuré sur les
 * seize dépôts d'olive_services : 0,48 s avec, 0,52 s sans.
 */
export async function etatDepot(chemin: string): Promise<DepotGit | null> {
  try {
    const { stdout } = await run(
      'git',
      [
        '-c',
        'core.quotepath=false',
        '-C',
        chemin,
        'status',
        '--porcelain=v2',
        '--branch',
        '-z',
        '-uall'
      ],
      { timeout: 8000, maxBuffer: 16 * 1024 * 1024 }
    )
    const statut = lireStatut(stdout)
    return { nom: basename(chemin), chemin, ...statut }
  } catch {
    return null
  }
}

/**
 * L'état git d'un projet, tous dépôts confondus.
 *
 * Un dossier hors dépôt et sans dépôt dessous rend `null`. Ce n'est pas une
 * erreur : beaucoup de projets n'en sont pas.
 */
export async function etat(chemin: string): Promise<EtatGit | null> {
  const { racines, reproches } = await depots(chemin)
  if (racines.length === 0 && reproches.length === 0) return null

  const lus = await Promise.all(racines.map(etatDepot))
  const trouves = lus.filter((d): d is DepotGit => d !== null)

  const branches = new Set(trouves.map((d) => d.branche).filter(Boolean))
  const tous = trouves.flatMap((d) => d.fichiers)

  return {
    depots: trouves,
    // Seize dépôts sur trois branches n'ont pas de branche commune à annoncer.
    branche: branches.size === 1 ? [...branches][0] : undefined,
    modifies: tous.filter(estModifie).length,
    nonSuivis: tous.filter(estNonSuivi).length,
    ...(reproches.length > 0 ? { reproches } : {})
  }
}

/** Ce qu'un dépôt est en train de faire, et qui interdit d'y commiter par-dessus. */
export type Chantier = 'fusion' | 'rebasage' | 'picorage' | 'annulation'

const MARQUEURS: [string, Chantier][] = [
  ['MERGE_HEAD', 'fusion'],
  ['rebase-merge', 'rebasage'],
  ['rebase-apply', 'rebasage'],
  ['CHERRY_PICK_HEAD', 'picorage'],
  ['REVERT_HEAD', 'annulation']
]

/**
 * Ce qu'un dépôt a laissé en plan, s'il a laissé quelque chose.
 *
 * Commiter au milieu d'une fusion non résolue clôt la fusion avec des marqueurs
 * de conflit dans le code. Le savoir avant vaut mieux que d'échouer après, et
 * git ne le dit qu'au moment où il refuse.
 *
 * Le dossier est demandé à git plutôt que déduit : `.git` est un fichier dans
 * un sous-module ou un arbre de travail lié.
 */
export async function chantier(depot: string): Promise<Chantier | undefined> {
  try {
    const { stdout } = await run('git', ['-C', depot, 'rev-parse', '--absolute-git-dir'], {
      timeout: 4000
    })
    const dossier = stdout.trim()
    for (const [marqueur, nom] of MARQUEURS) {
      if (await existe(join(dossier, marqueur))) return nom
    }
  } catch {
    return undefined
  }
  return undefined
}

/** Ce qu'un geste d'écriture a donné, dépôt par dépôt. */
export interface Compte {
  depot: string
  nom: string
  fait: boolean
  /** Ce que git a dit quand il a refusé, tel quel. */
  message?: string
}

/**
 * Indexe des fichiers puis commite, dans un seul dépôt.
 *
 * Le message d'échec est celui de git, sans réécriture. Un `pre-commit` qui
 * refuse explique pourquoi dans sa propre sortie, et c'est cette explication
 * qui sert à corriger. La résumer en « échec » la perdrait.
 */
export async function commiter(
  depot: string,
  fichiers: string[],
  message: string
): Promise<Compte> {
  const nom = basename(depot)
  if (fichiers.length === 0) return { depot, nom, fait: false, message: 'Aucun fichier choisi.' }

  const enPlan = await chantier(depot)
  if (enPlan) {
    return { depot, nom, fait: false, message: `Ce dépôt est en cours de ${enPlan}.` }
  }

  try {
    // `--` sépare les chemins des options : un fichier nommé `-f` serait sinon
    // lu comme un drapeau.
    await run('git', ['-C', depot, 'add', '--', ...fichiers], { timeout: 30_000 })
    await run('git', ['-C', depot, 'commit', '-m', message], {
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024
    })
    return { depot, nom, fait: true }
  } catch (erreur) {
    return { depot, nom, fait: false, message: ditGit(erreur) }
  }
}

/**
 * Pousse un dépôt vers son amont.
 *
 * Une branche sans amont ne peut pas être poussée sans qu'on dise où : plutôt
 * que d'inventer une destination, on le dit. C'est le cas de `deploy`.
 */
export async function pousser(depot: string): Promise<Compte> {
  const nom = basename(depot)
  const lu = await etatDepot(depot)
  if (lu && !lu.amont) {
    return { depot, nom, fait: false, message: 'Cette branche n’a pas d’amont où pousser.' }
  }

  try {
    await run('git', ['-C', depot, 'push'], { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 })
    return { depot, nom, fait: true }
  } catch (erreur) {
    return { depot, nom, fait: false, message: ditGit(erreur) }
  }
}

/**
 * Ce que git a dit, réduit à ce qui se lit.
 *
 * Git écrit ses refus sur la sortie d'erreur, souvent en plusieurs lignes dont
 * les premières portent l'essentiel. Les hooks, eux, écrivent où ils veulent.
 */
function ditGit(erreur: unknown): string {
  const echec = erreur as { stderr?: string; stdout?: string; message?: string }
  const texte = [echec.stderr, echec.stdout].filter(Boolean).join('\n').trim()
  if (!texte) return echec.message ?? 'Échec, sans message.'
  return texte.split('\n').slice(0, 12).join('\n')
}

/** Au-delà, le diff n'est plus lisible et son affichage coûterait plus qu'il ne montre. */
const DIFF_MAX = 2 * 1024 * 1024

export interface DiffLu {
  /** La sortie brute de git, vide quand il n'y a rien à montrer. */
  sortie: string
  /** Taille en octets quand elle dépasse le seuil, et que rien n'est rendu. */
  trop?: number
}

/**
 * Le diff d'un fichier, d'un côté ou de l'autre de l'index.
 *
 * Deux diffs distincts pour un même fichier : ce que l'index porte face à HEAD,
 * et ce que la copie de travail porte face à l'index. Les confondre en cacherait
 * un.
 *
 * Un fichier que git ne suit pas encore n'a pas d'ancien côté, et `git diff`
 * n'en dirait rien. `--no-index` contre `/dev/null` le montre entier comme
 * ajouté, ce qui est exactement ce qu'il est.
 */
export async function diff(
  depot: string,
  fichier: string,
  options: { indexe?: boolean; nonSuivi?: boolean; contexte?: number } = {}
): Promise<DiffLu> {
  // Trois lignes autour de chaque changement, ou le fichier entier. IntelliJ
  // montre tout par défaut et propose de replier ; l'inverse coûte moins cher
  // à afficher, et la bascule mène au même endroit.
  const commun = [
    '-c',
    'core.quotepath=false',
    '-C',
    depot,
    'diff',
    '--no-color',
    `-U${options.contexte ?? 3}`
  ]
  const arguments_ = options.nonSuivi
    ? [...commun, '--no-index', '--', '/dev/null', fichier]
    : [...commun, ...(options.indexe ? ['--cached'] : []), '--', fichier]

  try {
    const { stdout } = await run('git', arguments_, {
      timeout: 15_000,
      maxBuffer: DIFF_MAX + 1024
    })
    return { sortie: stdout }
  } catch (erreur) {
    // `--no-index` sort en 1 dès qu'il trouve une différence, ce qui est le cas
    // nominal ici : la sortie est bonne, seul le code de retour trompe.
    const echec = erreur as { code?: number; stdout?: string; message?: string }
    if (echec.code === 1 && typeof echec.stdout === 'string') return { sortie: echec.stdout }

    // Au-delà du tampon, node coupe et lève. C'est le signe qu'il ne faut pas
    // afficher, plutôt qu'une panne.
    if (echec.message?.includes('maxBuffer')) return { sortie: '', trop: DIFF_MAX }
    return { sortie: '' }
  }
}

/**
 * Parmi des noms d'un même dossier, ceux que git ignore.
 *
 * Les distinguer évite de confondre ce qui fait le projet et ce qui n'en est
 * que dérivé : dépendances, sorties de compilation, artefacts de test.
 */
export async function ignores(dossier: string, noms: string[]): Promise<Set<string>> {
  if (noms.length === 0) return new Set()
  try {
    const { stdout } = await run('git', ['-C', dossier, 'check-ignore', '--', ...noms], {
      timeout: 5000,
      maxBuffer: 4 * 1024 * 1024
    })
    return new Set(stdout.split('\n').filter(Boolean))
  } catch (erreur) {
    // `check-ignore` sort en 1 quand aucun chemin n'est ignoré, et en 128 hors
    // d'un dépôt : ni l'un ni l'autre n'est une anomalie.
    const code = (erreur as { code?: number }).code
    if (code === 1 || code === 128) return new Set()
    return new Set()
  }
}

async function existe(chemin: string): Promise<boolean> {
  try {
    await stat(chemin)
    return true
  } catch {
    return false
  }
}

/**
 * Le nombre de commits montrés à l'agent comme modèle de style.
 *
 * Assez pour que la langue, le format et le ton se dégagent ; pas au point
 * d'emplir le prompt de ce qui n'est pas le changement en cours.
 */
const EXEMPLES = 8

/** Au-delà, `claude` n'a pas répondu et l'on rend la main. */
const DELAI_REDACTION = 180_000

/**
 * Fait rédiger le message du commit à venir.
 *
 * `claude -p` plutôt qu'une clé d'API : il est déjà installé, c'est la
 * dépendance centrale de Claudex, et il porte l'abonnement de l'utilisateur.
 * Lancé dans le dossier du dépôt, il y lit aussi le `CLAUDE.md` s'il en est un,
 * donc les conventions du projet.
 *
 * L'agent n'écrit rien : il rend un texte que l'on relit avant de commiter.
 */
export async function redigerMessage(
  lots: { depot: string; fichiers: string[] }[]
): Promise<{ message?: string; erreur?: string }> {
  const utiles = lots.filter((l) => l.fichiers.length > 0)
  if (utiles.length === 0) return { erreur: 'Aucun fichier choisi.' }

  const apports: Apport[] = []
  for (const lot of utiles) {
    const apport = await apportDe(lot.depot, lot.fichiers)
    if (apport) apports.push(apport)
  }
  if (apports.length === 0) return { erreur: 'Rien à lire dans ce qui est choisi.' }

  const prompt = construirePrompt(apports, await exemplesDe(utiles[0]!.depot))

  const rendu = await appelerClaude(prompt, utiles[0]!.depot)
  if (rendu.erreur) return rendu
  const message = nettoyer(rendu.message ?? '')
  return message ? { message } : { erreur: 'La réponse est vide.' }
}

/**
 * Ce qu'il faut lancer pour joindre Claude Code.
 *
 * Trois choses s'y ajoutent au simple nom de la commande.
 *
 * La variable la remplace : les cas de bout en bout y mettent un script, et une
 * installation qui range le binaire ailleurs s'en sert aussi.
 *
 * Le binaire de `~/.local/bin` sert de recours quand le PATH ne porte pas la
 * commande. L'installateur natif n'ajoute ce dossier au PATH qu'à la session
 * suivante de l'utilisateur : sans ce repli, la rédaction échouait sur
 * « commande introuvable » là où Claude Code est installé et fonctionne. L'écran
 * d'état faisait déjà ce détour, la rédaction l'avait oublié.
 *
 * Reste la façon de le lancer, que `lancementClaude` tranche : sur Windows,
 * `spawn` ne démarre directement qu'un vrai exécutable. Un `.cmd` — c'est la
 * forme qu'installe npm — demande l'interpréteur de commandes, qui réclame à
 * son tour que le chemin soit cité s'il porte un espace.
 */
export function claudeVoulu(): string {
  if (process.env.CLAUDEX_CLAUDE) return process.env.CLAUDEX_CLAUDE
  return existsSync(binaireClaude()) ? binaireClaude() : 'claude'
}

/** Comment `spawn` doit s'y prendre pour lancer ce qu'on lui nomme. */
export function lancementClaude(
  voulue: string,
  plateforme: NodeJS.Platform = process.platform
): { commande: string; shell: boolean } {
  const directement = plateforme !== 'win32' || voulue.toLowerCase().endsWith('.exe')
  return directement ? { commande: voulue, shell: false } : { commande: `"${voulue}"`, shell: true }
}

/**
 * Envoie un prompt à `claude -p` et rend sa réponse.
 *
 * Le prompt passe par l'entrée standard, non en argument : un diff de cinquante
 * kilo-octets dépasserait ce que la ligne de commande accepte. `execFile` ne
 * sait pas écrire sur l'entrée d'un processus, d'où `spawn`.
 */
function appelerClaude(
  prompt: string,
  dossier: string
): Promise<{ message?: string; erreur?: string }> {
  return new Promise((resoudre) => {
    const { commande, shell } = lancementClaude(claudeVoulu())
    const enfant = spawn(commande, ['-p'], { cwd: dossier, shell })
    let sortie = ''
    let plainte = ''
    let fini = false

    const finir = (rendu: { message?: string; erreur?: string }): void => {
      if (fini) return
      fini = true
      clearTimeout(minuterie)
      resoudre(rendu)
    }

    const minuterie = setTimeout(() => {
      enfant.kill('SIGKILL')
      finir({ erreur: 'La rédaction a dépassé trois minutes.' })
    }, DELAI_REDACTION)

    enfant.stdout.on('data', (bloc) => {
      sortie += String(bloc)
    })
    enfant.stderr.on('data', (bloc) => {
      plainte += String(bloc)
    })

    enfant.on('error', (erreur) => {
      const code = (erreur as NodeJS.ErrnoException).code
      finir({
        erreur:
          code === 'ENOENT'
            ? 'La commande `claude` est introuvable. Vois l’écran d’état.'
            : erreur.message
      })
    })

    enfant.on('close', (code) => {
      if (code === 0) return finir({ message: sortie })
      const dit = (plainte || sortie).trim().split('\n').slice(0, 4).join('\n')
      finir({ erreur: dit || `\`claude\` a rendu ${code}.` })
    })

    enfant.stdin.on('error', () => undefined)
    enfant.stdin.end(prompt)
  })
}

/** Le diff et le compte d'un dépôt, pour ses seuls fichiers choisis. */
async function apportDe(depot: string, fichiers: string[]): Promise<Apport | null> {
  const lu = await etatDepot(depot)
  const neufs = new Set(
    (lu?.fichiers ?? []).filter(estNonSuivi).map((f) => f.chemin)
  )
  const suivis = fichiers.filter((f) => !neufs.has(f))
  const ajoutes = fichiers.filter((f) => neufs.has(f))

  const morceaux: string[] = []
  let stat = ''

  if (suivis.length > 0) {
    // `HEAD` et non l'index : ce qui sera commité est l'état de travail, que
    // les fichiers soient déjà indexés ou non.
    stat = await sortie(depot, ['diff', '--stat', 'HEAD', '--', ...suivis])
    morceaux.push(await sortie(depot, ['diff', '--no-color', 'HEAD', '--', ...suivis]))
  }

  for (const neuf of ajoutes) {
    // Un fichier que git ne suit pas n'a pas d'ancien côté, et `git diff` n'en
    // dirait rien. `--no-index` contre `/dev/null` le montre entier.
    morceaux.push(await sortie(depot, ['diff', '--no-color', '--no-index', '/dev/null', neuf]))
  }
  if (ajoutes.length > 0) {
    stat = `${stat}\n${ajoutes.length} fichier(s) neuf(s) : ${ajoutes.join(', ')}`.trim()
  }

  const entier = morceaux.filter(Boolean).join('\n')
  if (!entier.trim()) return null

  const coupe = tronquer(entier)
  return { nom: basename(depot), stat: stat || 'compte indisponible', diff: coupe.texte, tronque: coupe.tronque }
}

/** Les derniers messages du dépôt, qui servent de modèle de style. */
async function exemplesDe(depot: string): Promise<string[]> {
  const texte = await sortie(depot, ['log', `-${EXEMPLES}`, '--format=%s%n%n%b%x00'])
  return texte
    .split('\0')
    .map((e) => e.trim())
    .filter(Boolean)
}

/**
 * La sortie d'une commande git, ou du vide.
 *
 * `git diff --no-index` sort en 1 dès qu'il trouve une différence, ce qui est
 * ici le cas nominal : sa sortie est bonne malgré ce code de retour.
 */
async function sortie(depot: string, arguments_: string[]): Promise<string> {
  try {
    const { stdout } = await run('git', ['-c', 'core.quotepath=false', '-C', depot, ...arguments_], {
      timeout: 20_000,
      maxBuffer: 16 * 1024 * 1024
    })
    return stdout
  } catch (erreur) {
    const echec = erreur as { code?: number; stdout?: string }
    return echec.code === 1 && typeof echec.stdout === 'string' ? echec.stdout : ''
  }
}

/** Ce qu'un dépôt offre comme branches, et où l'on est. */
export interface Branches {
  courante: string
  /** Les branches du dépôt, la locale d'abord, puis les distantes sans jumelle. */
  locales: string[]
  distantes: string[]
}

/**
 * Les branches d'un dépôt.
 *
 * Une distante dont une locale porte déjà le nom n'est pas listée deux fois :
 * s'y rendre passe par la locale, et voir « local » et « origin/local » côte à
 * côte laisserait croire à deux endroits différents.
 */
export async function branches(depot: string): Promise<Branches | null> {
  try {
    const [tete, refs] = await Promise.all([
      run('git', ['-C', depot, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 4000 }),
      run(
        'git',
        ['-C', depot, 'for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'],
        { timeout: 8000, maxBuffer: 4 * 1024 * 1024 }
      )
    ])

    const noms = refs.stdout.split('\n').filter(Boolean)
    const locales = noms.filter((n) => !n.includes('/') || !estDistante(n, noms))
    const distantes = noms.filter((n) => estDistante(n, noms) && !n.endsWith('/HEAD'))

    return {
      courante: tete.stdout.trim(),
      locales: locales.filter((n) => !distantes.includes(n)),
      // Celles dont aucune locale ne porte le nom : les autres se rejoignent
      // par leur locale.
      distantes: distantes.filter((d) => !locales.includes(sansDistant(d)))
    }
  } catch {
    return null
  }
}

/** Une référence sous `refs/remotes` porte le nom d'un distant en tête. */
function estDistante(nom: string, tous: string[]): boolean {
  const tete = nom.split('/')[0]
  // `origin` seul est le HEAD du distant ; `origin/x` en est une branche.
  return tete !== undefined && nom.includes('/') && tous.includes(tete)
}

/** `origin/local` désigne la même branche que `local`. */
function sansDistant(nom: string): string {
  return nom.split('/').slice(1).join('/')
}

/**
 * Change de branche dans un dépôt.
 *
 * Une branche distante donne une locale qui la suit, ce que fait `switch` sans
 * qu'on le lui demande. Un travail non commité qui gênerait le passage fait
 * échouer la commande, et git dit pourquoi : on ne force rien.
 */
export async function changerBranche(depot: string, branche: string): Promise<Compte> {
  const nom = basename(depot)
  const enPlan = await chantier(depot)
  if (enPlan) return { depot, nom, fait: false, message: `Ce dépôt est en cours de ${enPlan}.` }

  try {
    await run('git', ['-C', depot, 'switch', branche], { timeout: 60_000 })
    return { depot, nom, fait: true }
  } catch (erreur) {
    return { depot, nom, fait: false, message: ditGit(erreur) }
  }
}
