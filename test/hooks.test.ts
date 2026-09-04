import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const run = promisify(execFile)

/** Ce que l'utilisateur avait déjà : ses hooks ne doivent pas bouger d'un pouce. */
const EXISTANTS = {
  PreToolUse: [
    { matcher: 'Bash', hooks: [{ type: 'command', command: '~/.claude/hooks/rtk-rewrite.sh' }] }
  ],
  Notification: [{ matcher: '', hooks: [{ type: 'command', command: 'mpv need-human.mp3' }] }]
}

let maison: string
let hooks: typeof import('../src/main/services/hooks')

const settings = async (): Promise<Record<string, any>> =>
  JSON.parse(await readFile(join(maison, '.claude', 'settings.json'), 'utf8'))

const MAISON_REELLE = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE }

beforeAll(async () => {
  maison = await mkdtemp(join(tmpdir(), 'claudex-hooks-'))
  process.env.HOME = maison
  // `homedir()` ne lit pas HOME sur Windows, mais USERPROFILE. Sans lui, ce test
  // écrivait ses hooks dans le vrai ~/.claude/settings.json de la machine.
  process.env.USERPROFILE = maison
  process.env.CLAUDEX_HOOKS_DIR = join(maison, '.claude', 'claudex')
  await mkdir(join(maison, '.claude'), { recursive: true })
  await writeFile(
    join(maison, '.claude', 'settings.json'),
    JSON.stringify({ cleanupPeriodDays: 365, hooks: EXISTANTS }, null, 2)
  )
  hooks = await import('../src/main/services/hooks')
})

afterAll(() => {
  delete process.env.CLAUDEX_HOOKS_DIR
  for (const [clef, valeur] of Object.entries(MAISON_REELLE)) {
    if (valeur === undefined) delete process.env[clef]
    else process.env[clef] = valeur
  }
})

describe('installation des hooks de notification', () => {
  it("n'est pas détectée avant d'avoir eu lieu", async () => {
    expect(hooks.installes(await settings())).toBe(false)
  })

  it("s'ajoute sans toucher aux hooks déjà en place", async () => {
    const resultat = await hooks.installer()
    expect(resultat.ok).toBe(true)

    const apres = await settings()
    // Le hook rtk de l'utilisateur, et son son de notification, sont intacts.
    expect(apres.hooks.PreToolUse).toEqual(EXISTANTS.PreToolUse)
    expect(apres.hooks.Notification[0]).toEqual(EXISTANTS.Notification[0])
    expect(apres.cleanupPeriodDays).toBe(365)

    // Et les nôtres sont là, un par événement.
    const commandes = Object.values(apres.hooks)
      .flat()
      .flatMap((e: any) => e.hooks.map((h: any) => h.command))
      .filter((c: string) => c.includes(basename(hooks.cheminScript())))
    expect(commandes).toHaveLength(3)
    expect(hooks.installes(apres)).toBe(true)
  })

  it('laisse une sauvegarde du fichier précédent', async () => {
    const bak = JSON.parse(
      await readFile(join(maison, '.claude', 'settings.json.bak'), 'utf8')
    ) as Record<string, unknown>
    expect(bak.hooks).toEqual(EXISTANTS)
  })

  it('ne se dédouble pas si on l’installe deux fois', async () => {
    await hooks.installer()
    const commandes = Object.values(await settings().then((s) => s.hooks))
      .flat()
      .flatMap((e: any) => e.hooks.map((h: any) => h.command))
      .filter((c: string) => c.includes(basename(hooks.cheminScript())))
    expect(commandes).toHaveLength(3)
  })
})

describe('le script appelé par Claude Code', () => {
  const charge = JSON.stringify({ session_id: 'abc-123', message: 'needs your permission' })

  // Le script est appelé comme Claude Code l'appellera, interprète compris : le
  // lancer autrement reviendrait à tester une commande qui n'est écrite nulle part.
  const appeler = async (evenement: string): Promise<void> => {
    const { fichier, args } = hooks.invocation(evenement)
    const enfant = run(fichier, args)
    // Quand Claudex ne tourne pas, le script sort sans lire son entrée : c'est
    // tout son intérêt. L'écriture tombe alors dans un tuyau déjà fermé, et
    // l'EPIPE remonte hors de la promesse. Il faisait échouer le fichier
    // entier, au hasard de qui du script ou du test allait le plus vite.
    enfant.child.stdin?.on('error', () => undefined)
    enfant.child.stdin?.end(charge)
    await enfant
  }

  const deposes = async (): Promise<string[]> =>
    (await readdir(hooks.dossierEvenements()).catch(() => [])).filter((f) => f.endsWith('.json'))

  it("n'écrit rien quand Claudex ne tourne pas", async () => {
    await hooks.retirerPresence()
    await appeler('Notification')
    expect(await deposes()).toEqual([])
  })

  it("n'écrit rien pour une application morte", async () => {
    // Un pid abandonné par un arrêt brutal ne doit pas ressusciter le script.
    await writeFile(hooks.cheminPresence(), '999999\n')
    await appeler('Notification')
    expect(await deposes()).toEqual([])
  })

  it("dépose l'événement et sa charge quand l'application est là", async () => {
    await hooks.annoncerPresence(process.pid)
    await appeler('Notification')

    const fichiers = await deposes()
    expect(fichiers).toHaveLength(1)
    const contenu = await readFile(join(hooks.dossierEvenements(), fichiers[0]!), 'utf8')
    const [premiere, ...reste] = contenu.split('\n')
    expect(premiere).toBe('Notification')
    expect(JSON.parse(reste.join('\n'))).toEqual({
      session_id: 'abc-123',
      message: 'needs your permission'
    })
  })

  it('rend la main sans erreur, quoi qu’il arrive', async () => {
    // Un hook qui échoue perturbe Claude Code : celui-ci sort toujours à zéro.
    // Appelé sans nom d'événement et sur une entrée vide, c'est-à-dire dans le
    // pire des cas qu'on puisse lui présenter.
    const { fichier, args } = hooks.invocation('')
    const enfant = run(fichier, args)
    enfant.child.stdin?.end('')
    const { child } = enfant
    // `execFile` promisifié rejette sur un code non nul : c'est le code lui-même
    // qu'on veut voir, pas l'exception qu'il provoque.
    await enfant.catch(() => undefined)
    expect(child.exitCode).toBe(0)
  })
})

describe('retrait des hooks', () => {
  it('rend la configuration à son état d’origine', async () => {
    await hooks.retirer()
    const apres = await settings()
    expect(apres.hooks).toEqual(EXISTANTS)
    expect(hooks.installes(apres)).toBe(false)
  })
})
