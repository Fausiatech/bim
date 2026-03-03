import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

console.log('CONFIG CARGADO')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  console.log('Token:', env.VITE_SPECKLE_TOKEN)

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/speckle/graphql': {
          target: 'https://app.speckle.systems',
          changeOrigin: true,
          rewrite: () => '/graphql',
          headers: {
            'Authorization': `Bearer ${env.VITE_SPECKLE_TOKEN}`
          }
        },
        '/speckle/objects': {
          target: 'https://app.speckle.systems',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/speckle/, ''),
          headers: {
            'Authorization': `Bearer ${env.VITE_SPECKLE_TOKEN}`
          }
        }
      }
    }
  }
})
