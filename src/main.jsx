import { createRoot } from 'react-dom/client'

console.log('ANTES DE IMPORTAR APP')
import('./App.jsx').then(m => {
  console.log('APP IMPORTADO:', m)
  createRoot(document.getElementById('root')).render(<m.default />)
}).catch(e => {
  console.error('FALLO IMPORT APP:', e)
  document.getElementById('root').innerHTML = '<pre style="color:red;background:white">' + e.message + '\n' + e.stack + '</pre>'
})