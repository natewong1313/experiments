type WireValue = null | boolean | number | string | readonly WireValue[] | WireRecord;

type WireRecord = { readonly [key: string]: WireValue };

function isWireValue(value: unknown): value is WireValue {
  if (value === null) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isWireValue(item));
  }

  if (isWireRecord(value)) {
    return true;
  }

  return typeof value === "boolean" || typeof value === "number" || typeof value === "string";
}

function isWireRecord(value: unknown): value is WireRecord {
  if (value === null || Array.isArray(value)) {
    return false;
  }

  if (typeof value !== "object") {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  return Object.values(value).every((item) => isWireValue(item));
}

export { isWireRecord, isWireValue, type WireRecord, type WireValue };
