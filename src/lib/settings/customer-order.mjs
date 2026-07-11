export function normalizeCustomerIds(customerIds) {
  return Array.from(
    new Set(
      customerIds
        .map((customerId) => String(customerId ?? "").trim())
        .filter(Boolean),
    ),
  );
}

/**
 * @template T
 * @param {T[]} customerIds
 * @param {T} activeId
 * @param {T} overId
 * @returns {T[]}
 */
export function moveCustomerId(customerIds, activeId, overId) {
  const oldIndex = customerIds.indexOf(activeId);
  const newIndex = customerIds.indexOf(overId);

  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return customerIds;
  }

  const next = [...customerIds];
  const [moved] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, moved);
  return next;
}
