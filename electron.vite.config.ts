import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // Deux points d'entrée. L'application, et le serveur MCP que Claude Code
        // lance à part : il ne démarre ni fenêtre ni Electron, seulement le
        // moteur Node qu'Electron embarque.
        input: {
          index: resolve('src/main/index.ts'),
          mcp: resolve('src/mcp/index.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        // `@xterm/headless` 6.0.0 annonce un `module` qui n'est pas dans le
        // paquet publié : `lib/xterm.mjs` n'existe pas. Vite préfère ce champ et
        // refuse alors de résoudre le paquet, ce qui fait échouer la construction
        // du processus principal. On le mène droit au fichier livré. À retirer le
        // jour où le paquet amont sera réparé.
        '@xterm/headless': resolve('node_modules/@xterm/headless/lib-headless/xterm-headless.mjs')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // Le preload doit rester en CommonJS : Electron refuse un preload ESM
    // lorsque la fenêtre est en sandbox, et le sandbox n'est pas négociable ici.
    build: {
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    },
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
