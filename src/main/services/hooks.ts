import { chmod, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { claudeSettingsPath, claudexHooksDir } from '../util/paths'

/**
 * Les hooks par lesquels Claude Code prévient qu'il a besoin de son utilisateur.
 *
 * `Notification` est le signal utile : Claude Code l'émet quand il demande une
 * permission ou qu'il attend une réponse. Les deux autres disent que l'attente
 * est finie — on a repris la main, ou l'agent a rendu la sienne — et servent à
 * éteindre le voyant plutôt qu'à l'allumer.
 */
export const EVENEMENTS = ['Notification', 'Stop', 'UserPromptSubmit'] as const
export type Evenement = (typeof EVENEMENTS)[number]

export function cheminScript(): string {
  return join(claudexHooksDir(), 'notifier.sh')
}

export function cheminPresence(): string {
  return join(claudexHooksDir(), 'pid')
}

export function dossierEvenements(): string {
  return join(claudexHooksDir(), 'evenements')
}

/**
 * Le script appelé par Claude Code.
 *
 * Il ne décide de rien : il dépose l'événement reçu et rend la main tout de
 * suite, parce que Claude Code attend qu'un hook se termine avant de continuer.
 * Et il ne fait rien du tout quand Claudex ne tourne pas — sans quoi il
 * laisserait des fichiers derrière lui pour chaque conversation de la machine.
 *
 * Le fichier est écrit à côté puis déplacé : un renommage est atomique, là où
 * une écriture directe donnerait à lire un fichier encore à moitié écrit.
 */
const SCRIPT = `#!/bin/sh
# Écrit par Claudex. Prévient l'application quand Claude Code réclame son
# utilisateur. Retirer les hooks depuis l'écran d'état de Claudex, ou effacer
# ce dossier, suffit à le désactiver.
set -u
dossier=$(dirname "$0")

pid=$(cat "$dossier/pid" 2>/dev/null) || exit 0
[ -n "\${pid:-}" ] || exit 0
kill -0 "$pid" 2>/dev/null || exit 0

mkdir -p "$dossier/evenements" || exit 0
tmp=$(mktemp "$dossier/evt.XXXXXX") || exit 0
{ printf '%s\\n' "\${1:-inconnu}"; cat; } > "$tmp"
mv "$tmp" "$dossier/evenements/$(basename "$tmp").json" 2>/dev/null || rm -f "$tmp"
exit 0
`

interface EntreeHook {
  matcher?: string
  hooks?: Array<{ type?: string; command?: string }>
}

/** Vrai si la configuration appelle déjà notre script. */
export function installes(settings: Record<string, unknown>): boolean {
  const hooks = (settings.hooks ?? {}) as Record<string, EntreeHook[] | undefined>
  const script = cheminScript()
  return EVENEMENTS.every((evenement) =>
    (hooks[evenement] ?? []).some((entree) =>
      (entree.hooks ?? []).some((h) => (h.command ?? '').includes(script))
    )
  )
}

function lire(brut: string): Record<string, unknown> | null {
  try {
    const objet = JSON.parse(brut) as unknown
    return objet && typeof objet === 'object' ? (objet as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function chargerSettings(): Promise<{
  settings: Record<string, unknown>
  existe: boolean
} | null> {
  let brut = '{}'
  let existe = true
  try {
    brut = await readFile(claudeSettingsPath(), 'utf8')
  } catch {
    existe = false
  }
  const settings = lire(brut)
  return settings ? { settings, existe } : null
}

async function ecrireSettings(settings: Record<string, unknown>, existe: boolean): Promise<void> {
  const chemin = claudeSettingsPath()
  if (existe) await copyFile(chemin, `${chemin}.bak`)
  await mkdir(join(chemin, '..'), { recursive: true })
  await writeFile(chemin, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

/**
 * Ajoute nos hooks à ceux de l'utilisateur, sans jamais toucher aux siens.
 *
 * Chaque événement reçoit une entrée à part plutôt qu'une commande glissée dans
 * une entrée existante : elle se voit, et se retire sans risquer d'emporter
 * autre chose avec elle.
 */
export async function installer(): Promise<{ ok: boolean; message: string }> {
  const charge = await chargerSettings()
  if (!charge) {
    return {
      ok: false,
      message: `${claudeSettingsPath()} n'est pas un JSON valide. Aucune modification n'a été faite.`
    }
  }

  await mkdir(claudexHooksDir(), { recursive: true })
  await writeFile(cheminScript(), SCRIPT, 'utf8')
  await chmod(cheminScript(), 0o755)

  const { settings, existe } = charge
  const hooks = (settings.hooks ?? {}) as Record<string, EntreeHook[]>
  for (const evenement of EVENEMENTS) {
    const entrees = (hooks[evenement] ??= [])
    const dejaLa = entrees.some((entree) =>
      (entree.hooks ?? []).some((h) => (h.command ?? '').includes(cheminScript()))
    )
    if (dejaLa) continue
    entrees.push({
      matcher: '',
      hooks: [{ type: 'command', command: `${cheminScript()} ${evenement}` }]
    })
  }
  settings.hooks = hooks
  await ecrireSettings(settings, existe)

  return {
    ok: true,
    message: existe
      ? `Notifications installées. Sauvegarde : ${claudeSettingsPath()}.bak`
      : 'Notifications installées (fichier de configuration créé).'
  }
}

/** Retire nos hooks et le script, en laissant ceux de l'utilisateur en place. */
export async function retirer(): Promise<{ ok: boolean; message: string }> {
  const charge = await chargerSettings()
  if (!charge) {
    return {
      ok: false,
      message: `${claudeSettingsPath()} n'est pas un JSON valide. Aucune modification n'a été faite.`
    }
  }

  const { settings, existe } = charge
  const hooks = (settings.hooks ?? {}) as Record<string, EntreeHook[]>
  for (const [evenement, entrees] of Object.entries(hooks)) {
    const restantes = entrees.filter(
      (entree) => !(entree.hooks ?? []).some((h) => (h.command ?? '').includes(cheminScript()))
    )
    if (restantes.length > 0) hooks[evenement] = restantes
    else delete hooks[evenement]
  }
  if (Object.keys(hooks).length > 0) settings.hooks = hooks
  else delete settings.hooks
  await ecrireSettings(settings, existe)

  await rm(cheminScript(), { force: true })
  return { ok: true, message: 'Notifications retirées. Le script a été effacé.' }
}

/** Marque de présence : le script n'écrit rien tant qu'elle ne désigne pas un vivant. */
export async function annoncerPresence(pid: number): Promise<void> {
  await mkdir(dossierEvenements(), { recursive: true })
  await writeFile(cheminPresence(), `${pid}\n`, 'utf8')
}

export async function retirerPresence(): Promise<void> {
  await rm(cheminPresence(), { force: true })
}
