export type CustomerOrderFields = {
  code?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  name?: string | null;
  sortOrder?: number | string | null;
  sort_order?: number | string | null;
};

const customerCodeCollator = new Intl.Collator("th", {
  numeric: true,
  sensitivity: "base",
});

function getSortOrder(value: CustomerOrderFields) {
  const parsed = Number(value.sortOrder ?? value.sort_order ?? Number.MAX_SAFE_INTEGER);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function getCode(value: CustomerOrderFields) {
  return String(value.customerCode ?? value.code ?? "").trim();
}

function getName(value: CustomerOrderFields) {
  return String(value.customerName ?? value.name ?? "").trim();
}

export function compareCustomerOrder<T extends CustomerOrderFields>(left: T, right: T) {
  const sortOrderDifference = getSortOrder(left) - getSortOrder(right);
  if (sortOrderDifference !== 0) return sortOrderDifference;

  const codeDifference = customerCodeCollator.compare(getCode(left), getCode(right));
  if (codeDifference !== 0) return codeDifference;

  return getName(left).localeCompare(getName(right), "th");
}

export function sortCustomersByOrder<T extends CustomerOrderFields>(customers: T[]) {
  return customers.toSorted(compareCustomerOrder);
}
