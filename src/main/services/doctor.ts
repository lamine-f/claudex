import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { DoctorCheck } from '@shared/types'
import { trouvable } from '../util/chemin'
import { binaireClaude, claudeProjectsRoot, claudeSettingsPath } from '../util/paths'
import { installes } from './hooks'
import { multiplexeur } from './multiplexeur'

const run = promisify(execFile)

const RETENTION_PAR_DEFAUT = 30
const RETENTION_CIBLE = 365

async function versionDe(binaire: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run(binaire, args, { timeout: 5000 })
    const ligne = stdout.trim().split('\n')[0] ?? ''
    // Les outils répondent chacun à leur façon — « tmux 3.7c », mais
    // « 2.1.259 (Claude Code) » : on ne garde que le numéro, le nom étant déjà
    // porté par le libellé du contrôle.
    return ligne.match(/\d[\w.-]*/)?.[0] ?? ligne ?? null
  } catch {
    return null
  }
}

async function lireSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(claudeSettingsPath(), 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Compte les sessions qui seront effacées dans les `fenetreJours` prochains jours.
 *
 * Seule la profondeur 1 est parcourue : `~/.claude/projects/<dossier>/<uuid>.jsonl`.
 * Les fichiers plus profonds (`<dossier>/<uuid>/subagents/agent-*.jsonl`) sont des
 * transcrits de sous-agents, pas des conversations reprenables — les compter
 * gonflerait le diagnostic sans rien dire d'utile.
 */
async function sessionsBientotEffacees(
  retentionJours: number,
  fenetreJours: number
): Promise<number> {
  const racine = claudeProjectsRoot()
  const limite = Date.now() - (retentionJours - fenetreJours) * 86_400_000
  let compte = 0
  let dossiers: string[]
  try {
    dossiers = await readdir(racine)
  } catch {
    return 0
  }
  for (const dossier of dossiers) {
    let fichiers: string[]
    try {
      fichiers = await readdir(join(racine, dossier))
    } catch {
      continue
    }
    for (const fichier of fichiers) {
      if (!fichier.endsWith('.jsonl')) continue
      try {
        const s = await stat(join(racine, dossier, fichier))
        if (s.mtimeMs < limite) compte++
      } catch {
        /* fichier disparu entre-temps : sans importance */
      }
    }
  }
  return compte
}

/**
 * Version de Claude Code, en repassant par le binaire déposé dans `~/.local/bin`
 * quand la commande n'est pas sur le PATH.
 */
async function versionClaude(): Promise<string | null> {
  const surLeChemin = await versionDe('claude', ['--version'])
  if (surLeChemin) return surLeChemin
  const binaire = binaireClaude()
  return existsSync(binaire) ? versionDe(binaire, ['--version']) : null
}

export async function check(): Promise<DoctorCheck[]> {
  const [terminal, claude, settings] = await Promise.all([
    multiplexeur.version(),
    versionClaude(),
    lireSettings()
  ])

  const retention =
    typeof settings.cleanupPeriodDays === 'number'
      ? settings.cleanupPeriodDays
      : RETENTION_PAR_DEFAUT
  const bientot = await sessionsBientotEffacees(retention, 7)

  const checks: DoctorCheck[] = [
    terminal
      ? { id: 'multiplexeur', label: multiplexeur.nom, severity: 'ok', detail: terminal }
      : {
          id: 'multiplexeur',
          label: multiplexeur.nom,
          severity: 'error',
          detail: `${multiplexeur.nom} est introuvable. Les terminaux persistants en dépendent : installe-le avec \`brew install tmux\`.`
        },
    claude
      ? { id: 'claude', label: 'Claude Code', severity: 'ok', detail: claude }
      : {
          id: 'claude',
          label: 'Claude Code',
          severity: 'warn',
          detail: "La commande `claude` est introuvable. Les terminaux fonctionneront, mais les sessions d'agent ne seront pas disponibles."
        }
  ]

  // Le contrôle n'existe que là où l'outil peut manquer. macOS a le Finder et
  // Windows l'explorateur, qui font partie du système : une ligne toujours verte
  // n'apprendrait rien et encombrerait l'écran.
  if (process.platform === 'linux' && !trouvable('xdg-open')) {
    checks.push({
      id: 'gestionnaire',
      label: 'Gestionnaire de fichiers',
      severity: 'warn',
      detail:
        "`xdg-open` est introuvable, et c'est par lui que « Ouvrir dans le " +
        "gestionnaire de fichiers » passe. Le clic droit reste sans effet. " +
        'Installe-le avec `sudo apt install xdg-utils`, et le gestionnaire ' +
        "lui-même s'il manque aussi : `sudo apt install nautilus`. Le paquet " +
        "Debian de Claudex réclame déjà `xdg-utils` ; l'AppImage ne peut rien " +
        "exiger, et c'est là que le cas se rencontre."
    })
  }

  // Une promesse que le pilote ne tient pas se dit à l'écran d'état, jamais par
  // la surprise d'un agent disparu à la réouverture de l'application.
  if (!multiplexeur.persistant) {
    checks.push({
      id: 'persistance',
      label: 'Persistance des terminaux',
      severity: 'warn',
      detail:
        `${multiplexeur.nom} n'a pas de serveur derrière lui : une session vit dans ` +
        `Claudex et meurt avec lui. Les onglets et les conversations sont retrouvés ` +
        `au lancement suivant, avec l'écran d'avant, mais ce qui tournait a été ` +
        `interrompu. Fermer l'application pendant qu'un agent travaille l'arrête.`
    })
  }

  if (retention >= RETENTION_CIBLE) {
    checks.push({
      id: 'retention',
      label: 'Rétention des sessions',
      severity: 'ok',
      detail: `cleanupPeriodDays = ${retention} jours.`
    })
  } else {
    // Toujours signalé tant que la rétention n'est pas relevée : ce n'est pas une
    // panne, mais une perte programmée. Les conversations effacées ne sont plus
    // reprenables, et c'est précisément ce que Claudex apporte.
    checks.push({
      id: 'retention',
      label: 'Rétention des sessions',
      severity: 'warn',
      detail:
        `Claude Code efface une conversation ${retention} jours après sa dernière activité ` +
        `(cleanupPeriodDays), et elle n'est alors plus reprenable. ` +
        (bientot > 0
          ? `${bientot} conversation${bientot > 1 ? 's' : ''} ` +
            `${bientot > 1 ? 'partiront' : 'partira'} dans les 7 prochains jours.`
          : 'Aucune ne part dans les 7 prochains jours.'),
      impose: true,
      fix: {
        label: `Porter la rétention à ${RETENTION_CIBLE} jours`,
        action: 'applySettingsFix'
      }
    })
  }

  if (installes(settings)) {
    checks.push({
      id: 'notifications',
      label: 'Notifications des agents',
      severity: 'ok',
      detail:
        'Claude Code prévient Claudex quand un agent demande une permission ou ' +
        'attend une réponse.',
      fix: { label: 'Retirer les notifications', action: 'retirerHooks' }
    })
  } else {
    checks.push({
      id: 'notifications',
      label: 'Notifications des agents',
      severity: 'warn',
      detail:
        "Rien ne prévient quand un agent s'arrête pour demander une permission ou " +
        "poser une question : il attend, et on ne le sait qu'en revenant sur son " +
        'onglet. Claudex peut ajouter trois hooks à ~/.claude/settings.json, qui ' +
        "appellent un script déposé dans ~/.claude/claudex/. Ce script n'écrit " +
        "rien quand Claudex ne tourne pas, et les hooks déjà en place ne sont pas " +
        'touchés.',
      fix: { label: 'Installer les notifications', action: 'installerHooks' }
    })
  }

  return checks
}

/**
 * Écrit `cleanupPeriodDays` dans ~/.claude/settings.json par fusion, jamais par
 * remplacement : ce fichier contient les hooks et permissions de l'utilisateur.
 * Une copie .bak est faite avant toute écriture.
 */
export async function applySettingsFix(): Promise<{ ok: boolean; message: string }> {
  const chemin = claudeSettingsPath()
  let brut = '{}'
  let existe = true
  try {
    brut = await readFile(chemin, 'utf8')
  } catch {
    existe = false
  }

  let settings: Record<string, unknown>
  try {
    settings = JSON.parse(brut) as Record<string, unknown>
  } catch {
    return {
      ok: false,
      message: `${chemin} n'est pas un JSON valide. Aucune modification n'a été faite.`
    }
  }

  if (existe) await copyFile(chemin, `${chemin}.bak`)

  settings.cleanupPeriodDays = RETENTION_CIBLE
  await writeFile(chemin, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')

  return {
    ok: true,
    message: existe
      ? `Rétention portée à ${RETENTION_CIBLE} jours. Sauvegarde : ${chemin}.bak`
      : `Rétention portée à ${RETENTION_CIBLE} jours (fichier créé).`
  }
}
