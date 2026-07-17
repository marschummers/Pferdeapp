import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

export default function MealDetailPage() {
  const { mealId } = useParams<{ mealId: string }>()
  const meal = useLiveQuery(() => (mealId ? db.meals.get(mealId) : undefined), [mealId])
  const ingredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray(), []) ?? []
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]))

  const [isEditing, setIsEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const [newIngredientId, setNewIngredientId] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [editingIngredientIndex, setEditingIngredientIndex] = useState<number | null>(null)
  const [editingAmountText, setEditingAmountText] = useState('')

  const [newStep, setNewStep] = useState('')
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null)
  const [editingStepText, setEditingStepText] = useState('')

  const [tipDraft, setTipDraft] = useState<string | null>(null)

  if (!meal) {
    return <p className="hint">Mahlzeit wird geladen…</p>
  }

  function enterEditMode() {
    setNameDraft(meal!.name)
    setTipDraft(meal!.tip ?? '')
    setIsEditing(true)
  }

  async function finishEditing() {
    const trimmedName = nameDraft.trim()
    if (trimmedName && trimmedName !== meal!.name) {
      await db.meals.update(meal!.id, { name: trimmedName })
    }
    if (tipDraft !== null && tipDraft.trim() !== (meal!.tip ?? '')) {
      await db.meals.update(meal!.id, { tip: tipDraft.trim() || undefined })
    }
    setEditingIngredientIndex(null)
    setEditingStepIndex(null)
    setIsEditing(false)
  }

  async function addIngredient() {
    const amount = parseFloat(newAmount)
    if (!newIngredientId || !amount || amount <= 0) return
    await db.meals.update(meal!.id, { ingredients: [...meal!.ingredients, { ingredientId: newIngredientId, amount }] })
    setNewIngredientId('')
    setNewAmount('')
  }

  function startEditAmount(index: number, amount: number) {
    setEditingIngredientIndex(index)
    setEditingAmountText(String(amount))
  }

  async function commitAmountEdit() {
    if (editingIngredientIndex === null) return
    const amount = parseFloat(editingAmountText)
    if (amount && amount > 0) {
      const updated = meal!.ingredients.map((ing, i) => (i === editingIngredientIndex ? { ...ing, amount } : ing))
      await db.meals.update(meal!.id, { ingredients: updated })
    }
    setEditingIngredientIndex(null)
  }

  async function removeIngredient(index: number) {
    await db.meals.update(meal!.id, { ingredients: meal!.ingredients.filter((_, i) => i !== index) })
  }

  async function addStep() {
    const text = newStep.trim()
    if (!text) return
    await db.meals.update(meal!.id, { prepSteps: [...meal!.prepSteps, text] })
    setNewStep('')
  }

  function startEditStep(index: number, text: string) {
    setEditingStepIndex(index)
    setEditingStepText(text)
  }

  async function commitStepEdit() {
    if (editingStepIndex === null) return
    const text = editingStepText.trim()
    if (text) {
      const updated = meal!.prepSteps.map((s, i) => (i === editingStepIndex ? text : s))
      await db.meals.update(meal!.id, { prepSteps: updated })
    }
    setEditingStepIndex(null)
  }

  async function removeStep(index: number) {
    await db.meals.update(meal!.id, { prepSteps: meal!.prepSteps.filter((_, i) => i !== index) })
  }

  async function moveStep(index: number, direction: -1 | 1) {
    const otherIndex = index + direction
    if (otherIndex < 0 || otherIndex >= meal!.prepSteps.length) return
    const steps = [...meal!.prepSteps]
    ;[steps[index], steps[otherIndex]] = [steps[otherIndex], steps[index]]
    await db.meals.update(meal!.id, { prepSteps: steps })
  }

  const usedIngredientIds = new Set(meal.ingredients.map((i) => i.ingredientId))
  const availableIngredients = ingredients.filter((i) => !usedIngredientIds.has(i.id))
  const selectedNewIngredient = ingredients.find((i) => i.id === newIngredientId)

  return (
    <div>
      <Link to="/fuetterung" className="back-link">
        ‹ Fütterung
      </Link>

      <div className="meal-title-row">
        {isEditing ? (
          <>
            <input
              className="meal-title-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  finishEditing()
                }
              }}
              autoFocus
            />
            <button className="secondary-button save-toggle-button" onClick={finishEditing}>
              Speichern
            </button>
          </>
        ) : (
          <>
            <h1 className="meal-title">{meal.name}</h1>
            <button className="icon-button meal-menu-button" onClick={enterEditMode} aria-label="Bearbeiten">
              ⋮
            </button>
          </>
        )}
      </div>

      <div className="paper-card meal-paper">
        <h2 className="paper-heading">Zusammensetzung</h2>
        {meal.ingredients.length === 0 && <p className="paper-hint">Noch keine Zutaten hinzugefügt.</p>}
        <ul className="ingredient-list">
          {meal.ingredients.map((ing, i) => {
            const def = ingredientById.get(ing.ingredientId)
            return (
              <li className="ingredient-list-row" key={`${ing.ingredientId}-${i}`}>
                <span className="ingredient-list-name">{def?.name ?? '(gelöschte Zutat)'}</span>
                {!isEditing ? (
                  <span className="ingredient-amount">
                    {ing.amount} {def?.unit ?? ''}
                  </span>
                ) : editingIngredientIndex === i ? (
                  <>
                    <input
                      className="ingredient-amount-input"
                      type="number"
                      value={editingAmountText}
                      onChange={(e) => setEditingAmountText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitAmountEdit()
                        }
                      }}
                      autoFocus
                    />
                    <button className="paper-icon-button" onClick={commitAmountEdit} aria-label="Menge speichern">
                      ✓
                    </button>
                  </>
                ) : (
                  <>
                    <button className="ingredient-amount" onClick={() => startEditAmount(i, ing.amount)}>
                      {ing.amount} {def?.unit ?? ''}
                    </button>
                    <button
                      className="paper-icon-button"
                      onClick={() => removeIngredient(i)}
                      aria-label="Zutat entfernen"
                    >
                      ✕
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>

        {isEditing &&
          (ingredients.length === 0 ? (
            <p className="paper-hint">Noch keine Zutaten angelegt – unter „Verwaltung → Zutaten“ anlegen.</p>
          ) : (
            <div className="paper-add-row">
              <select value={newIngredientId} onChange={(e) => setNewIngredientId(e.target.value)}>
                <option value="">Zutat wählen…</option>
                {availableIngredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <input
                className="ingredient-amount-input"
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder={selectedNewIngredient ? selectedNewIngredient.unit : 'Menge'}
              />
              <button className="paper-add-button" onClick={addIngredient} disabled={!newIngredientId || !newAmount}>
                +
              </button>
            </div>
          ))}

        <h2 className="paper-heading paper-heading-spaced">Zubereitung</h2>
        {meal.prepSteps.length === 0 && <p className="paper-hint">Noch keine Schritte hinzugefügt.</p>}
        <ol className="step-list">
          {meal.prepSteps.map((step, i) => (
            <li className="step-list-row" key={i}>
              <span className="step-number">{i + 1}</span>
              {isEditing && editingStepIndex === i ? (
                <>
                  <input
                    className="step-edit-input"
                    value={editingStepText}
                    onChange={(e) => setEditingStepText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitStepEdit()
                      }
                    }}
                    autoFocus
                  />
                  <button className="paper-icon-button" onClick={commitStepEdit} aria-label="Schritt speichern">
                    ✓
                  </button>
                </>
              ) : (
                <span
                  className={isEditing ? 'step-text' : 'step-text step-text-readonly'}
                  onClick={isEditing ? () => startEditStep(i, step) : undefined}
                >
                  {step}
                </span>
              )}
              {isEditing && editingStepIndex !== i && (
                <div className="step-actions">
                  <button
                    className="paper-icon-button"
                    disabled={i === 0}
                    onClick={() => moveStep(i, -1)}
                    aria-label="Schritt nach oben"
                  >
                    ▲
                  </button>
                  <button
                    className="paper-icon-button"
                    disabled={i === meal.prepSteps.length - 1}
                    onClick={() => moveStep(i, 1)}
                    aria-label="Schritt nach unten"
                  >
                    ▼
                  </button>
                  <button className="paper-icon-button" onClick={() => removeStep(i)} aria-label="Schritt entfernen">
                    ✕
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
        {isEditing && (
          <div className="paper-add-row">
            <input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              placeholder="Neuer Schritt…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addStep()
                }
              }}
            />
            <button className="paper-add-button" onClick={addStep} disabled={!newStep.trim()}>
              +
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="tip-card">
          <span className="tip-card-label">Tipp</span>
          <textarea
            rows={2}
            value={tipDraft ?? ''}
            onChange={(e) => setTipDraft(e.target.value)}
            placeholder="z.B. Immer erst kalt füttern, sonst besteht Kolikgefahr."
          />
        </div>
      ) : (
        meal.tip && (
          <div className="tip-card">
            <span className="tip-card-label">Tipp</span>
            <p className="tip-card-text">{meal.tip}</p>
          </div>
        )
      )}
    </div>
  )
}
