import { ipcMain } from 'electron'
import type { DoctorCheck } from '@shared/types'
import { applySettingsFix, check } from '../services/doctor'
import { installer, retirer } from '../services/hooks'

type Correctif = NonNullable<DoctorCheck['fix']>['action']

const CORRECTIFS: Record<Correctif, () => Promise<{ ok: boolean; message: string }>> = {
  applySettingsFix,
  installerHooks: installer,
  retirerHooks: retirer
}

export function registerDoctorIpc(): void {
  ipcMain.handle('doctor:check', () => check())
  ipcMain.handle('doctor:appliquer', (_evenement, action: Correctif) => {
    const correctif = CORRECTIFS[action]
    if (!correctif) return { ok: false, message: `Correctif inconnu : ${action}` }
    return correctif()
  })
}
