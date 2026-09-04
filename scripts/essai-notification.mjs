/**
 * Déclenche une vraie notification, comme le ferait Claude Code.
 *
 *   node scripts/essai-notification.mjs [uuid de session]
 *
 * Sans argument, la première conversation ouverte dans Claudex est prise. Le
 * chemin est le vrai : le script installé dans ~/.claude/claudex/ est appelé
 * avec la même charge que Claude Code envoie, et c'est l'application qui
 * décide. Elle ne prévient que si sa fenêtre n'a pas le focus — passer sur une
 * autre application avant de lancer la commande fait donc partie de l'essai.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const dossier = process.env.CLAUDEX_HOOKS_DIR ?? join(homedir(), '.claude', 'claudex')
const script = join(dossier, 'notifier.sh')

let pid
try {
  pid = Number(readFileSync(join(dossier, 'pid'), 'utf8').trim())
  process.kill(pid, 0)
} catch {
  console.error(
    "Claudex ne tourne pas : le script ne fait rien dans ce cas, c'est voulu.\n" +
      'Lance l\'application, puis relance cette commande.'
  )
  process.exit(1)
}

/**
 * Là où Electron range `userData`, selon le système. Le chemin est recopié
 * plutôt que demandé : ce script tourne sous Node, hors de l'application.
 */
function dossierDonnees() {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Claudex')
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Claudex')
}

const etat = join(dossierDonnees(), 'state.json')
let session = process.argv[2]
let titre = ''
if (!session) {
  const { tabs = [] } = JSON.parse(readFileSync(etat, 'utf8'))
  const onglet = tabs.find((t) => t.claudeSessionId)
  if (!onglet) {
    console.error('Aucune conversation ouverte dans Claudex : ouvres-en une, puis recommence.')
    process.exit(1)
  }
  session = onglet.claudeSessionId
  titre = onglet.title
}

const charge = JSON.stringify({
  session_id: session,
  message: 'Claude needs your permission to use Bash',
  hook_event_name: 'Notification'
})

// Claudex se tait quand sa fenêtre a le focus : le compte à rebours laisse le
// temps de passer ailleurs, faute de quoi l'essai ne prouverait rien.
const attente = Number(process.env.CLAUDEX_ESSAI_DELAI ?? 5)
for (let reste = attente; reste > 0; reste--) {
  process.stdout.write(`\rPassez sur une autre application… dépôt dans ${reste} s `)
  await new Promise((suite) => setTimeout(suite, 1000))
}
process.stdout.write('\r'.padEnd(50, ' ') + '\r')

const enfant = spawn('sh', [script, 'Notification'], { stdio: ['pipe', 'inherit', 'inherit'] })
enfant.stdin.end(charge)
enfant.on('exit', (code) => {
  console.log(
    code === 0
      ? `Événement déposé pour « ${titre || session} » (Claudex : pid ${pid}).\n` +
          "Si la fenêtre n'avait pas le focus, la notification doit être apparue."
      : `Le script est sorti en ${code}.`
  )
})
