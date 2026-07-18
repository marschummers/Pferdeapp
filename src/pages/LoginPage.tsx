import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function LoginPage() {
  const { signInWithOtp } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const trimmed = email.trim()
    if (!trimmed) return
    setSubmitting(true)
    setError(null)
    const { error: signInError } = await signInWithOtp(trimmed)
    setSubmitting(false)
    if (signInError) {
      setError(signInError)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="login-screen">
      <h1>Stallplaner</h1>
      <div className="edit-panel login-panel">
        {sent ? (
          <p className="hint">
            Link verschickt an <strong>{email}</strong> – bitte E-Mail-Postfach prüfen und den Link öffnen.
          </p>
        ) : (
          <>
            <p className="hint">Melde dich mit deiner E-Mail-Adresse an, du bekommst dann einen Login-Link.</p>
            <div className="field">
              <span>E-Mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="du@beispiel.de"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                autoFocus
              />
            </div>
            {error && <p className="login-error">{error}</p>}
            <button className="primary-button" onClick={handleSubmit} disabled={!email.trim() || submitting}>
              {submitting ? 'Wird gesendet…' : 'Login-Link senden'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
