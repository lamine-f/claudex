import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

export function createWindow(): BrowserWindow {
  const fenetre = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0d0e12',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  })

  fenetre.once('ready-to-show', () => fenetre.show())

  // Remontée des défaillances du renderer dans la sortie du processus main :
  // sans cela, un preload en échec se traduit par une fenêtre noire silencieuse.
  fenetre.webContents.on('preload-error', (_evenement, chemin, erreur) => {
    console.error('[preload] échec de', chemin, '\n', erreur)
  })
  fenetre.webContents.on('render-process-gone', (_evenement, details) => {
    console.error('[renderer] processus perdu :', details.reason)
  })
  fenetre.webContents.on('console-message', (details) => {
    if (details.level === 'error' || details.level === 'warning') {
      console.error(`[renderer:${details.level}]`, details.message, details.sourceId ?? '')
    }
  })

  // Aucune navigation ni ouverture de fenêtre depuis le renderer : les liens
  // externes partent dans le navigateur du système.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  fenetre.webContents.on('will-navigate', (evenement, url) => {
    if (url !== fenetre.webContents.getURL()) evenement.preventDefault()
  })

  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    void fenetre.loadURL(devServer)
  } else {
    void fenetre.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return fenetre
}
