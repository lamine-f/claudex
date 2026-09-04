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

const SUR_WINDOWS = process.platform === 'win32'

export function cheminScript(): string {
  return join(claudexHooksDir(), SUR_WINDOWS ? 'notifier.ps1' : 'notifier.sh')
}

/**
 * Ce qu'on écrit dans `settings.json` pour que Claude Code appelle le script.
 *
 * Sur Windows, le chemin ne suffit pas : un `.ps1` n'est pas exécutable en soi,
 * il faut nommer l'interprète. `-ExecutionPolicy Bypass` est indispensable — la
 * politique par défaut d'un poste Windows refuse d'exécuter un script local, et
 * le hook échouerait sans que rien ne le dise.
 */
export function commandeHook(evenement: string): string {
  return SUR_WINDOWS
    ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${cheminScript()}" ${evenement}`
    : `${cheminScript()} ${evenement}`
}

/**
 * Le script et ses arguments, pour qui veut l'exécuter directement.
 *
 * Les tests s'en servent afin d'appeler le script exactement comme Claude Code
 * l'appellera. Le dupliquer chez eux revenait à tester une autre commande que
 * celle qu'on écrit dans la configuration.
 */
export function invocation(evenement: string): { fichier: string; args: string[] } {
  return SUR_WINDOWS
    ? {
        fichier: 'powershell.exe',
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', cheminScript(), evenement]
      }
    : { fichier: 'sh', args: [cheminScript(), evenement] }
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
const SCRIPT_SH = `#!/bin/sh
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

/**
 * La même chose pour Windows, où rien de tout cela n'existe.
 *
 * `kill -0` devient `Get-Process -Id`, `mktemp` un GUID, et `mv` un
 * `[IO.File]::Move` — le renommage reste la seule écriture atomique disponible.
 *
 * Le `try` englobe tout et la sortie est toujours zéro : Claude Code attend la
 * fin de ses hooks, et un script qui échoue lui remonte une erreur pour un
 * service qu'il n'a pas demandé.
 *
 * `$PID` est une variable automatique de PowerShell, qui désigne le processus
 * courant. Nommer la nôtre ainsi faisait comparer Claudex à lui-même, et le hook
 * écrivait alors pour toutes les conversations de la machine.
 */
const SCRIPT_PS1 = `# Écrit par Claudex. Prévient l'application quand Claude Code réclame son
# utilisateur. Retirer les hooks depuis l'écran d'état de Claudex, ou effacer
# ce dossier, suffit à le désactiver.
try {
  $dossier = Split-Path -Parent $MyInvocation.MyCommand.Path
  $marque = Join-Path $dossier 'pid'
  if (-not (Test-Path -LiteralPath $marque)) { exit 0 }

  $vivant = (Get-Content -LiteralPath $marque -TotalCount 1 -ErrorAction SilentlyContinue)
  if ([string]::IsNullOrWhiteSpace($vivant)) { exit 0 }
  if (-not (Get-Process -Id ([int]$vivant.Trim()) -ErrorAction SilentlyContinue)) { exit 0 }

  $evenements = Join-Path $dossier 'evenements'
  New-Item -ItemType Directory -Force -Path $evenements | Out-Null

  $nom = [guid]::NewGuid().ToString('N')
  $tmp = Join-Path $dossier "evt.$nom"
  $evenement = if ($args.Count -gt 0 -and $args[0]) { $args[0] } else { 'inconnu' }
  $charge = [Console]::In.ReadToEnd()

  [IO.File]::WriteAllText($tmp, "$evenement\`n$charge", (New-Object Text.UTF8Encoding($false)))
  [IO.File]::Move($tmp, (Join-Path $evenements "$nom.json"))
} catch {
}
exit 0
`

/**
 * Le contenu à déposer, avec sa marque d'ordre des octets sur Windows.
 *
 * Windows PowerShell 5.1 lit un `.ps1` sans BOM selon la page de codes ANSI du
 * poste : les accents des commentaires en ressortaient abîmés, et une chaîne
 * accentuée aurait fait échouer l'analyse du script.
 */
function contenuScript(): string {
  return SUR_WINDOWS ? `﻿${SCRIPT_PS1}` : SCRIPT_SH
}

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
  await writeFile(cheminScript(), contenuScript(), 'utf8')
  // Windows n'a pas de bit d'exécution : c'est l'extension qui décide, et le
  // script est de toute façon lancé par un interprète nommé dans la commande.
  if (!SUR_WINDOWS) await chmod(cheminScript(), 0o755)

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
      hooks: [{ type: 'command', command: commandeHook(evenement) }]
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
