const { app } = require('electron')
app.disableHardwareAcceleration()
app.whenReady().then(() => {
  let pty
  try {
    pty = require('node-pty')
  } catch (e) {
    console.log('ECHEC require:', e.message)
    return app.exit(1)
  }
  console.log('require node-pty : OK')
  const p = pty.spawn('/bin/sh', ['-c', 'echo CLAUDEX_PTY_OK; tmux -V'], {
    name: 'xterm-256color', cols: 80, rows: 24, cwd: process.cwd(), env: process.env
  })
  let out = ''
  p.onData(d => { out += d })
  p.onExit(({ exitCode }) => {
    console.log('sortie pty :', JSON.stringify(out.trim()))
    console.log('code       :', exitCode)
    console.log(out.includes('CLAUDEX_PTY_OK') ? 'RESULTAT: SUCCES' : 'RESULTAT: ECHEC')
    app.exit(out.includes('CLAUDEX_PTY_OK') ? 0 : 1)
  })
})
