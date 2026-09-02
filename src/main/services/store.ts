import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { AppState } from '@shared/types'

const ETAT_INITIAL: AppState = {
  workspaces: [],
  tabs: [],
  layout: { leftWidth: 260, middleWidth: 300 }
}

let etat: AppState = structuredClone(ETAT_INITIAL)
let charge = false
let minuterie: NodeJS.Timeout | null = null

function chemin(): string {
  return join(app.getPath('userData'), 'state.json')
}

export async function load(): Promise<AppState> {
  if (charge) return etat
  try {
    const brut = await readFile(chemin(), 'utf8')
    const lu = JSON.parse(brut) as Partial<AppState>
    etat = {
      ...structuredClone(ETAT_INITIAL),
      ...lu,
      workspaces: lu.workspaces ?? [],
      tabs: lu.tabs ?? [],
      layout: { ...ETAT_INITIAL.layout, ...(lu.layout ?? {}) }
    }
  } catch {
    // Premier lancement, ou fichier illisible : on repart d'un état vide plutôt que
    // d'empêcher l'app de démarrer.
    etat = structuredClone(ETAT_INITIAL)
  }
  charge = true
  return etat
}

export function get(): AppState {
  return etat
}

/** Écriture atomique : fichier temporaire puis rename, pour ne jamais laisser un
 *  state.json tronqué derrière un arrêt brutal. */
async function ecrire(): Promise<void> {
  const cible = chemin()
  await mkdir(dirname(cible), { recursive: true })
  const temporaire = `${cible}.${randomUUID()}.tmp`
  await writeFile(temporaire, `${JSON.stringify(etat, null, 2)}\n`, 'utf8')
  await rename(temporaire, cible)
}

/** Applique une modification et programme une écriture différée. */
export function update(modif: (etat: AppState) => void): AppState {
  modif(etat)
  if (minuterie) clearTimeout(minuterie)
  minuterie = setTimeout(() => {
    void ecrire()
  }, 250)
  return etat
}

/** Écriture immédiate, pour la fermeture de l'application. */
export async function flush(): Promise<void> {
  if (minuterie) {
    clearTimeout(minuterie)
    minuterie = null
  }
  await ecrire()
}
