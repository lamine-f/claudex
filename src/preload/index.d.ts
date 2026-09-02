import type { ClaudexApi } from './index'

declare global {
  interface Window {
    claudex: ClaudexApi
  }
}

export {}
