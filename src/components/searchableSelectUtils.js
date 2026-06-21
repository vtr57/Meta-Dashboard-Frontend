export function toSearchableItems(rows, idField) {
  return (rows || [])
    .map((row) => {
      const id = String(row?.[idField] || '').trim()
      if (!id) return null
      const name = String(row?.name || '').trim()
      const displayName = String(row?.display_name || '').trim()
      const label = displayName || (name && name !== id ? `${name} (${id})` : id)
      return {
        id,
        label,
        searchIndex: `${name} ${displayName} ${row?.status_display || ''} ${id}`.toLowerCase(),
      }
    })
    .filter(Boolean)
}
