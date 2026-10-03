type Equal<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

// Ignore loose-object index signatures, then compare every modeled field recursively.
type KnownFields<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

type MatchingVariant<T, U> = U extends { sessionUpdate: infer Kind }
  ? Extract<T, { sessionUpdate: Kind }>
  : U extends { type: infer Kind }
    ? Extract<T, { type: Kind }>
    : U extends { outcome: infer Kind extends string }
      ? Extract<T, { outcome: Kind }>
      : T;

type FieldDrift<T, U> = {
  [K in keyof KnownFields<U>]-?: K extends keyof T
    ? Equal<
        Pick<T, never> extends Pick<T, K> ? true : false,
        Pick<U, never> extends Pick<U, K> ? true : false
      > extends true
      ? Drift<T[K], U[K]>
      : false
    : false;
}[keyof KnownFields<U>];

type ValueDrift<T, U> = U extends (infer Item)[]
  ? [T] extends [(infer UpstreamItem)[]]
    ? U extends []
      ? true
      : Drift<UpstreamItem, Item>
    : false
  : U extends object
    ? [MatchingVariant<T, U>] extends [object]
      ? FieldDrift<MatchingVariant<T, U>, U>
      : false
    : Equal<T, U>;

type Drift<T, U> =
  Equal<T, U> extends true
    ? true
    : Equal<Extract<T, null | undefined>, Extract<U, null | undefined>> extends true
      ? [ValueDrift<NonNullable<T>, NonNullable<U>>] extends [true]
        ? true
        : false
      : false;

type Expect<T extends true> = T;

export type { Drift, Expect };
