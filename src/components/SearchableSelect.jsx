import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function buildMultiValueSummary(items, values, placeholder) {
  const selectedItems = items.filter((item) => values.includes(item.id))
  if (selectedItems.length === 0) return placeholder
  if (selectedItems.length === 1) return selectedItems[0].label
  if (selectedItems.length === 2) return `${selectedItems[0].label} + 1`
  return `${selectedItems[0].label} + ${selectedItems.length - 1}`
}

function SearchableSelect({
  value,
  items,
  placeholder,
  disabled,
  onChange,
  ariaLabel,
  multiple = false,
}) {
  const rootRef = useRef(null)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const selectedValues = useMemo(() => {
    if (multiple) {
      return Array.isArray(value) ? value : []
    }
    return typeof value === 'string' ? value : ''
  }, [multiple, value])

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current) return
      if (rootRef.current.contains(event.target)) return
      setMenuOpen(false)
      if (!multiple) {
        setQuery((current) => current.trim())
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [multiple])

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items.slice(0, 80)
    return items.filter((item) => item.searchIndex.includes(normalized)).slice(0, 80)
  }, [items, query])
  const singleSelectedLabel = useMemo(() => {
    if (multiple) return ''
    const selected = items.find((item) => item.id === selectedValues)
    return selected ? selected.label : ''
  }, [items, multiple, selectedValues])

  const selectValue = useCallback(
    (nextValue) => {
      if (multiple) {
        const currentValues = Array.isArray(selectedValues) ? selectedValues : []
        if (!nextValue) {
          onChange([])
          return
        }
        const nextValues = currentValues.includes(nextValue)
          ? currentValues.filter((item) => item !== nextValue)
          : [...currentValues, nextValue]
        onChange(nextValues)
        return
      }

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
    [items, multiple, onChange, selectedValues],
  )

  const commitTypedValue = useCallback(() => {
    if (multiple) return

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

    const selected = items.find((item) => item.id === selectedValues)
    setQuery(selected ? selected.label : '')
  }, [items, multiple, onChange, query, selectedValues])

  const handleInputBlur = () => {
    if (multiple) return
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
    if (!multiple && !nextValue.trim()) {
      onChange('')
    }
  }

  const handleInputKeyDown = (event) => {
    if (multiple) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenuOpen(false)
      }
      return
    }

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
      const selected = items.find((item) => item.id === selectedValues)
      setQuery(selected ? selected.label : '')
      setMenuOpen(false)
    }
  }

  if (multiple) {
    const selectedCount = Array.isArray(selectedValues) ? selectedValues.length : 0
    const summaryText = buildMultiValueSummary(items, selectedValues, placeholder)

    return (
      <div className={`searchable-select searchable-select-multiple ${menuOpen ? 'is-open' : ''}`} ref={rootRef}>
        <button
          type="button"
          className="searchable-select-trigger"
          onClick={() => setMenuOpen((current) => !current)}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={menuOpen}
        >
          <span className={`searchable-select-summary ${selectedCount === 0 ? 'is-placeholder' : ''}`}>{summaryText}</span>
          {selectedCount > 0 ? <span className="searchable-select-count">{selectedCount}</span> : null}
          <i className={`fa-solid ${menuOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" />
        </button>

        {menuOpen && !disabled ? (
          <div className="searchable-select-menu searchable-select-menu-multiple" role="listbox" aria-label={ariaLabel}>
            <div className="searchable-select-menu-top">
              <input
                type="text"
                value={query}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                placeholder="Buscar"
                aria-label={`${ariaLabel} busca`}
                autoFocus
              />
              <button
                type="button"
                className="searchable-select-clear-btn"
                onClick={() => onChange([])}
                disabled={selectedCount === 0}
              >
                Limpar
              </button>
            </div>
            {filteredItems.length === 0 ? (
              <p className="searchable-select-empty">Nenhum resultado.</p>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedValues.includes(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`searchable-select-option searchable-select-option-multiple ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => selectValue(item.id)}
                  >
                    <span className={`searchable-select-checkbox ${isSelected ? 'is-selected' : ''}`} aria-hidden="true">
                      {isSelected ? <i className="fa-solid fa-check" aria-hidden="true" /> : null}
                    </span>
                    <span>{item.label}</span>
                  </button>
                )
              })
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="searchable-select" ref={rootRef}>
      <input
        type="text"
        value={menuOpen ? query : singleSelectedLabel}
        onChange={handleInputChange}
        onFocus={() => {
          setQuery(singleSelectedLabel)
          setMenuOpen(true)
        }}
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
            className={`searchable-select-option ${selectedValues === '' ? 'is-selected' : ''}`}
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
                className={`searchable-select-option ${selectedValues === item.id ? 'is-selected' : ''}`}
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
