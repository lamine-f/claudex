import { ipcMain } from 'electron'
import { applySettingsFix, check } from '../services/doctor'

export function registerDoctorIpc(): void {
  ipcMain.handle('doctor:check', () => check())
  ipcMain.handle('doctor:applySettingsFix', () => applySettingsFix())
}
