import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    optimizeDeps: {
      //exclude: ['web-ifc-viewer', 'web-ifc']
    },
    build: {
      commonjsOptions: {
        transformMixedEsModules: true,
      }
    },
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
