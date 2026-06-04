import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export function toSearchableItems(rows, idField) {
  return (rows || [])
    .map((row) => {
      const id = String(row?.[idField] || '').trim()
      if (!id) return null
      const name = String(row?.name || '').trim()
      const label = name && name !== id ? `${name} (${id})` : id
      return {
        id,
        label,
        searchIndex: `${name} ${id}`.toLowerCase(),
      }
    })
    .filter(Boolean)
}

function SearchableSelect({
  value,
  items,
  placeholder,
  disabled,
  onChange,
  ariaLabel,
}) {
  const rootRef = useRef(null)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const selected = items.find((item) => item.id === value)
    setQuery(selected ? selected.label : '')
  }, [items, value])

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current) return
      if (rootRef.current.contains(event.target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items.slice(0, 80)
    return items.filter((item) => item.searchIndex.includes(normalized)).slice(0, 80)
  }, [items, query])

  const selectValue = useCallback(
    (nextValue) => {
      if (!nextValue) {
        onChange('')
        setQuery('')
        setMenuOpen(false)
        return
      }
      const selected = items.find((item) => item.id === nextValue)
      onChange(nextValue)
      setQuery(selected ? selected.label : '')
      setMenuOpen(false)
    },
    [items, onChange],
  )

  const commitTypedValue = useCallback(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      onChange('')
      setQuery('')
      return
    }

    const exactMatch = items.find(
      (item) => item.id.toLowerCase() === normalized || item.label.toLowerCase() === normalized,
    )
    if (exactMatch) {
      onChange(exactMatch.id)
      setQuery(exactMatch.label)
      return
    }

    const selected = items.find((item) => item.id === value)
    setQuery(selected ? selected.label : '')
  }, [items, onChange, query, value])

  const handleInputBlur = () => {
    window.setTimeout(() => {
      if (!rootRef.current) return
      if (rootRef.current.contains(document.activeElement)) return
      commitTypedValue()
      setMenuOpen(false)
    }, 0)
  }

  const handleInputChange = (event) => {
    const nextValue = event.target.value
    setQuery(nextValue)
    setMenuOpen(true)
    if (!nextValue.trim()) {
      onChange('')
    }
  }

  const handleInputKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (filteredItems.length > 0) {
        selectValue(filteredItems[0].id)
      } else {
        commitTypedValue()
        setMenuOpen(false)
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      const selected = items.find((item) => item.id === value)
      setQuery(selected ? selected.label : '')
      setMenuOpen(false)
    }
  }

  return (
    <div className="searchable-select" ref={rootRef}>
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => setMenuOpen(true)}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      {menuOpen && !disabled ? (
        <div className="searchable-select-menu" role="listbox" aria-label={ariaLabel}>
          <button
            type="button"
            className={`searchable-select-option ${value === '' ? 'is-selected' : ''}`}
            onMouseDown={(event) => {
              event.preventDefault()
              selectValue('')
            }}
          >
            {placeholder}
          </button>
          {filteredItems.length === 0 ? (
            <p className="searchable-select-empty">Nenhum resultado.</p>
          ) : (
            filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`searchable-select-option ${value === item.id ? 'is-selected' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  selectValue(item.id)
                }}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export default SearchableSelect
