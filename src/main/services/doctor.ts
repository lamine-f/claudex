import { execFile } from 'node:child_process'
import { copyFile, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { DoctorCheck } from '@shared/types'
import { claudeProjectsRoot, claudeSettingsPath } from '../util/paths'

const run = promisify(execFile)

const RETENTION_PAR_DEFAUT = 30
const RETENTION_CIBLE = 365

async function versionDe(binaire: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run(binaire, args, { timeout: 5000 })
    return stdout.trim().split('\n')[0] ?? null
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

export async function check(): Promise<DoctorCheck[]> {
  const [tmux, claude, settings] = await Promise.all([
    versionDe('tmux', ['-V']),
    versionDe('claude', ['--version']),
    lireSettings()
  ])

  const retention =
    typeof settings.cleanupPeriodDays === 'number'
      ? settings.cleanupPeriodDays
      : RETENTION_PAR_DEFAUT
  const bientot = await sessionsBientotEffacees(retention, 7)

  const checks: DoctorCheck[] = [
    tmux
      ? { id: 'tmux', label: 'tmux', severity: 'ok', detail: tmux }
      : {
          id: 'tmux',
          label: 'tmux',
          severity: 'error',
          detail: "tmux est introuvable. Les terminaux persistants en dépendent : installe-le avec `brew install tmux`."
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
      fix: {
        label: `Porter la rétention à ${RETENTION_CIBLE} jours`,
        action: 'applySettingsFix'
      }
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
