import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { arreterVeilleurs } from './ipc/fs'
import { annoncerPresence, retirerPresence } from './services/hooks'
import * as notifications from './services/notifications'
import { toutArreter } from './services/session-watcher'
import * as pty from './services/pty'
import * as scrollback from './services/scrollback'
import * as store from './services/store'
import * as tmux from './services/tmux'
import { createWindow } from './window'

app.setName('Claudex')

// Une seule instance : deux fenêtres attachées aux mêmes sessions tmux se
// marcheraient dessus.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [fenetre] = BrowserWindow.getAllWindows()
    if (fenetre) {
      if (fenetre.isMinimized()) fenetre.restore()
      fenetre.focus()
    }
  })

  void app.whenReady().then(async () => {
    await tmux.preparerConfiguration(app.getPath('userData'))
    await store.load()
    registerIpc()
    createWindow()

    // Le script de notification ne parle qu'à une application vivante : sans
    // cette marque, il se tait — et il faut donc la poser avant d'écouter.
    await annoncerPresence(process.pid).catch(() => undefined)
    await notifications.demarrer().catch(() => undefined)

    // Copie régulière de l'écran des terminaux. Elle ne sert qu'après un
    // redémarrage de la machine, mais c'est précisément le moment où l'on ne peut
    // plus la faire.
    setInterval(() => {
      void scrollback.sauvegarderTous(store.get().tabs)
    }, 30_000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // L'état est écrit de façon différée pour ne pas toucher le disque à chaque
  // frappe. À la fermeture, il faut donc retarder la sortie le temps de l'écrire :
  // sans cela, un onglet ouvert juste avant de quitter est perdu, et c'est
  // précisément ce que Claudex promet de ne jamais faire.
  let pretAQuitter = false
  app.on('before-quit', (evenement) => {
    if (pretAQuitter) return
    evenement.preventDefault()

    // Les pty sont de simples clients tmux : les détacher laisse les sessions
    // — et tout ce qui y tourne — intactes pour la prochaine ouverture.
    pty.detachAll()
    arreterVeilleurs()
    toutArreter()
    void notifications.arreter()
    void retirerPresence()

    // Filet de sécurité : une écriture qui s'éternise ne doit pas rendre
    // l'application impossible à fermer.
    const secours = setTimeout(() => {
      pretAQuitter = true
      app.quit()
    }, 4000)

    void scrollback
      .sauvegarderTous(store.get().tabs)
      .then(() => store.flush())
      .catch((erreur) => console.error('[store] échec de la sauvegarde finale :', erreur))
      .finally(() => {
        clearTimeout(secours)
        pretAQuitter = true
        app.quit()
      })
  })
}
