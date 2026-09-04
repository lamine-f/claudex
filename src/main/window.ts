import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'

/**
 * Le cadre de la fenêtre.
 *
 * Sur macOS, la barre de titre s'efface et ses feux viennent se poser dans la
 * bande du haut de Claudex, qui porte déjà le contexte. Windows garde son cadre
 * ordinaire : le dessiner soi-même obligerait à refaire les boutons, l'ancrage
 * des fenêtres et le survol du bouton d'agrandissement qui propose les
 * dispositions, pour au mieux les imiter. La bande de Claudex reste alors ce
 * qu'elle est, un contenu, sous une barre de titre qui appartient au système.
 */
const cadre =
  process.platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 11 } }
    : {}

export function createWindow(): BrowserWindow {
  const fenetre = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#000000',
    ...cadre,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  })

  fenetre.once('ready-to-show', () => {
    fenetre.show()

    // Réclamer explicitement le focus système. Lancée depuis un processus détaché
    // — un shell en arrière-plan, un script — l'application s'affiche et reçoit les
    // clics, mais macOS ne lui donne pas le clavier : le terminal paraît alors mort
    // alors que tout fonctionne dessous.
    if (process.platform === 'darwin') app.focus({ steal: true })
    fenetre.focus()
    fenetre.webContents.focus()
  })

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

  // Outils de développement à portée de main : sans eux, diagnostiquer un défaut
  // dans le rendu revient à deviner.
  fenetre.webContents.on('before-input-event', (evenement, saisie) => {
    const bascule =
      saisie.key === 'F12' ||
      (saisie.meta && saisie.alt && saisie.key.toLowerCase() === 'i') ||
      (saisie.control && saisie.shift && saisie.key.toLowerCase() === 'i')
    if (saisie.type === 'keyDown' && bascule) {
      evenement.preventDefault()
      fenetre.webContents.toggleDevTools()
    }
  })

  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    void fenetre.loadURL(devServer)
  } else {
    void fenetre.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return fenetre
}
