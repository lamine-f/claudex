/**
 * Pilote la fenêtre de Claudex par le protocole de débogage Chrome.
 *
 * Ni focus ni premier plan requis : la session de travail de l'utilisateur n'est
 * jamais interrompue, contrairement à `screencapture` ou aux clics simulés.
 * L'application doit tourner via `npm run dev:debug`.
 *
 *   node scripts/cdp.mjs shot <fichier.png>
 *   node scripts/cdp.mjs eval "<expression JavaScript>"
 */
import { writeFileSync } from 'node:fs'

const [commande, argument, port = '9222'] = process.argv.slice(2)

const cibles = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = cibles.find((c) => c.type === 'page' && !c.url.startsWith('devtools://'))
if (!page) {
  console.error('Aucune page trouvée.')
  process.exit(1)
}

const socket = new WebSocket(page.webSocketDebuggerUrl)
let compteur = 0
const attentes = new Map()

const envoyer = (method, params = {}) =>
  new Promise((resoudre, rejeter) => {
    const id = ++compteur
    attentes.set(id, { resoudre, rejeter })
    socket.send(JSON.stringify({ id, method, params }))
  })

socket.addEventListener('message', (evenement) => {
  const message = JSON.parse(evenement.data)
  const attente = attentes.get(message.id)
  if (!attente) return
  attentes.delete(message.id)
  if (message.error) attente.rejeter(new Error(message.error.message))
  else attente.resoudre(message.result)
})

socket.addEventListener('open', async () => {
  try {
    if (commande === 'shot') {
      const { data } = await envoyer('Page.captureScreenshot', { format: 'png' })
      writeFileSync(argument, Buffer.from(data, 'base64'))
      console.log(`capture écrite : ${argument}`)
    } else if (commande === 'eval') {
      const { result, exceptionDetails } = await envoyer('Runtime.evaluate', {
        expression: argument,
        awaitPromise: true,
        returnByValue: true
      })
      if (exceptionDetails) {
        console.error('exception :', exceptionDetails.text, exceptionDetails.exception?.description)
        process.exitCode = 1
      } else {
        console.log(JSON.stringify(result.value ?? null))
      }
    } else {
      console.error("commande inconnue : utilise 'shot' ou 'eval'")
      process.exitCode = 1
    }
  } catch (erreur) {
    console.error('échec :', erreur.message)
    process.exitCode = 1
  } finally {
    socket.close()
  }
})
