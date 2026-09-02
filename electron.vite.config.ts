import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
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
