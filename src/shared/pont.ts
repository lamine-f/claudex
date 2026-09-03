/**
 * Contrôle que le pont exposé par le preload offre tout ce que l'interface
 * attend.
 *
 * Le preload ne se recharge qu'au redémarrage complet d'Electron, là où le
 * renderer se met à jour tout seul : en développement, l'interface peut donc
 * appeler une méthode qui n'existe pas encore. L'appel échoue alors en silence
 * — une étiquette qu'on vient de saisir disparaît sans un mot.
 */
const ATTENDU: Record<string, string[]> = {
  state: ['get', 'setLayout', 'setActiveWorkspace'],
  workspace: ['list', 'add', 'remove', 'update'],
  term: ['list', 'create', 'open', 'input', 'resize', 'detach', 'close', 'rename'],
  fs: ['lireDossier', 'lireApercu', 'observer', 'cesserObservation'],
  claude: ['listSessions', 'ouvrir', 'nommer', 'etiqueter'],
  git: ['etat'],
  doctor: ['check', 'applySettingsFix']
}

/** Méthodes manquantes, sous la forme « claude.etiqueter ». */
export function manquesDuPont(pont: unknown): string[] {
  if (!pont || typeof pont !== 'object') return ['claudex']
  const groupes = pont as Record<string, Record<string, unknown> | undefined>

  return Object.entries(ATTENDU).flatMap(([groupe, methodes]) =>
    methodes.filter((m) => typeof groupes[groupe]?.[m] !== 'function').map((m) => `${groupe}.${m}`)
  )
}
