import { useState } from 'react'
import { supabase } from '../supabase'

export default function LoginForm({ onLogin }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [modo,     setModo]     = useState('login') // 'login' | 'register'
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleSubmit = async () => {
    if (!email || !password) return setError('Completá email y contraseña')
    setLoading(true); setError('')
    try {
      let result
      if (modo === 'login') {
        result = await supabase.auth.signInWithPassword({ email, password })
      } else {
        result = await supabase.auth.signUp({ email, password })
      }
      if (result.error) throw result.error
      // onAuthStateChange en App.jsx detecta el login automáticamente
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: '2rem',
        width: 340, boxShadow: '0 4px 24px rgba(0,0,0,0.1)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img src="/logo.png" alt="BIM AI" style={{ height: 48, marginBottom: 8 }} />
          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#1e293b' }}>BIM AI</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
            {modo === 'login' ? 'Iniciá sesión para continuar' : 'Creá tu cuenta'}
          </div>
        </div>

        {/* Tabs login / registro */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setModo(m); setError('') }} style={{
              flex: 1, padding: '0.4rem', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontWeight: 600, fontSize: '0.8rem',
              background: modo === m ? '#3b82f6' : '#f1f5f9',
              color: modo === m ? 'white' : '#64748b'
            }}>
              {m === 'login' ? 'Ingresar' : 'Registrarse'}
            </button>
          ))}
        </div>

        {/* Campos */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="tu@email.com" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Contraseña</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="••••••••" style={inputStyle} />
        </div>

        {error && (
          <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.78rem', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading} style={{
          width: '100%', padding: '0.6rem', border: 'none', borderRadius: 10,
          background: loading ? '#93c5fd' : '#3b82f6', color: 'white',
          fontWeight: 700, fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer'
        }}>
          {loading ? 'Cargando...' : modo === 'login' ? 'Ingresar' : 'Crear cuenta'}
        </button>

        {modo === 'register' && (
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center', marginTop: 12 }}>
            Al registrarte se te asigna rol de contratista por defecto.
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: 4 }
const inputStyle = {
  width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
}