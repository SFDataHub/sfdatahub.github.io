export const isIncrement = (value: unknown): value is { operand: number } =>
  Boolean(value && typeof value === "object" && "operand" in (value as Record<string, unknown>));

export const isArrayUnion = (value: unknown): value is { elements: unknown[] } =>
  Boolean(value && typeof value === "object" && "elements" in (value as Record<string, unknown>));

class FakeDocumentSnapshot {
  constructor(private readonly path: string, private readonly docData?: Record<string, unknown>) {}

  get exists() {
    return Boolean(this.docData);
  }

  get id() {
    const parts = this.path.split("/");
    return parts[parts.length - 1];
  }

  data() {
    return this.docData;
  }
}

class FakeDocumentReference {
  constructor(private readonly db: FakeFirestore, private readonly path: string) {}

  get id() {
    const parts = this.path.split("/");
    return parts[parts.length - 1];
  }

  collection(name: string) {
    return new FakeCollectionReference(this.db, `${this.path}/${name}`);
  }

  async get() {
    const entry = this.db.store.get(this.path);
    return new FakeDocumentSnapshot(this.path, entry ? { ...entry } : undefined);
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
    const existing = this.db.store.get(this.path);
    if (options?.merge && existing) {
      this.db.store.set(this.path, { ...existing, ...data });
    } else {
      this.db.store.set(this.path, { ...data });
    }
  }

  async update(data: Record<string, unknown>) {
    const existing = this.db.store.get(this.path);
    if (!existing) {
      throw new Error("Document does not exist");
    }
    const next = JSON.parse(JSON.stringify(existing)) as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      this.applyUpdate(next, key, value);
    }
    this.db.store.set(this.path, next);
  }

  private applyUpdate(target: Record<string, unknown>, dottedPath: string, value: unknown) {
    const parts = dottedPath.split(".");
    let cursor: Record<string, unknown> = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!cursor[part] || typeof cursor[part] !== "object") {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    const leafKey = parts[parts.length - 1];
    if (isIncrement(value)) {
      const current = typeof cursor[leafKey] === "number" ? (cursor[leafKey] as number) : 0;
      cursor[leafKey] = current + value.operand;
    } else if (isArrayUnion(value)) {
      const current = Array.isArray(cursor[leafKey]) ? (cursor[leafKey] as unknown[]) : [];
      const merged = [...new Set([...current, ...value.elements])];
      cursor[leafKey] = merged;
    } else {
      cursor[leafKey] = value as unknown;
    }
  }
}

type WhereFilter = {
  field: string;
  op: ">" | "in";
  value: unknown;
};

type OrderBy = {
  field: string;
  direction: "asc" | "desc";
};

const normalizeComparable = (value: unknown): number | string | unknown => {
  if (value && typeof value === "object" && "toMillis" in (value as Record<string, unknown>)) {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return value as unknown;
    }
  }
  return value as unknown;
};

class FakeQuery {
  constructor(
    protected readonly db: FakeFirestore,
    protected readonly path: string,
    protected readonly filters: WhereFilter[] = [],
    protected readonly orders: OrderBy[] = [],
  ) {}

  where(field: string, op: WhereFilter["op"], value: unknown) {
    return new FakeQuery(this.db, this.path, [...this.filters, { field, op, value }], this.orders);
  }

  orderBy(field: string, direction: OrderBy["direction"] = "asc") {
    return new FakeQuery(
      this.db,
      this.path,
      this.filters,
      [...this.orders, { field, direction }],
    );
  }

  async get() {
    const docs = [...this.db.store.entries()]
      .filter(([key]) => key.startsWith(`${this.path}/`))
      .map(([key, value]) => new FakeDocumentSnapshot(key, { ...value }));

    const filtered = docs.filter((doc) => {
      const data = doc.data() ?? {};
      return this.filters.every((filter) => {
        const val = (data as Record<string, unknown>)[filter.field];
        if (filter.op === ">") {
          const left = normalizeComparable(val);
          const right = normalizeComparable(filter.value);
          return typeof left === "number" && typeof right === "number" ? left > right : false;
        }
        if (filter.op === "in") {
          return Array.isArray(filter.value) && filter.value.includes(val as never);
        }
        return true;
      });
    });

    const sorted = [...filtered].sort((a, b) => {
      const aData = a.data() ?? {};
      const bData = b.data() ?? {};
      for (const order of this.orders) {
        const aVal = normalizeComparable((aData as Record<string, unknown>)[order.field]);
        const bVal = normalizeComparable((bData as Record<string, unknown>)[order.field]);
        if (aVal === bVal) continue;
        if (aVal === undefined) return 1;
        if (bVal === undefined) return -1;
        const comparison = (aVal as number) < (bVal as number) ? -1 : 1;
        return order.direction === "desc" ? -comparison : comparison;
      }
      return 0;
    });

    return { docs: sorted };
  }
}

class FakeCollectionReference extends FakeQuery {
  constructor(db: FakeFirestore, path: string) {
    super(db, path);
  }

  doc(id?: string) {
    const docId = id ?? this.db.generateId();
    return new FakeDocumentReference(this.db, `${this.path}/${docId}`);
  }

  async add(data: Record<string, unknown>) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }

  where(field: string, op: WhereFilter["op"], value: unknown) {
    return new FakeQuery(this.db, this.path, [{ field, op, value }], this.orders);
  }

  orderBy(field: string, direction: OrderBy["direction"] = "asc") {
    return new FakeQuery(this.db, this.path, this.filters, [{ field, direction }]);
  }
}

class FakeFile {
  constructor(private readonly bucket: FakeBucket, private readonly path: string) {}

  async save(buffer: Buffer, _options?: unknown) {
    if (this.bucket.shouldFail(this.path)) {
      this.bucket.consumeFail(this.path);
      throw new Error("Simulated storage failure");
    }
    this.bucket.files.set(this.path, buffer);
  }

  async download(): Promise<[Buffer]> {
    const data = this.bucket.files.get(this.path);
    if (!data) {
      throw new Error("File not found");
    }
    return [data];
  }
}

class FakeBucket {
  readonly files = new Map<string, Buffer>();
  private readonly failNext = new Set<string>();
  private failAny = false;

  file(path: string) {
    return new FakeFile(this, path);
  }

  shouldFail(path: string) {
    return this.failAny || this.failNext.has(path);
  }

  consumeFail(path: string) {
    if (this.failAny) {
      this.failAny = false;
    } else {
      this.failNext.delete(path);
    }
  }

  failNextSave(path?: string) {
    if (!path) {
      this.failAny = true;
      return;
    }
    this.failNext.add(path);
  }

  reset() {
    this.files.clear();
    this.failNext.clear();
    this.failAny = false;
  }
}

class FakeFirestore {
  readonly store = new Map<string, Record<string, unknown>>();
  private autoIdCounter = 0;

  collection(name: string) {
    return new FakeCollectionReference(this, name);
  }

  generateId() {
    this.autoIdCounter += 1;
    return `auto-${this.autoIdCounter.toString(16)}-${Date.now().toString(36)}`;
  }

  async runTransaction<T>(
    updateFunction: (tx: {
      get: (ref: FakeDocumentReference) => Promise<FakeDocumentSnapshot>;
      set: (
        ref: FakeDocumentReference,
        data: Record<string, unknown>,
        options?: { merge?: boolean },
      ) => Promise<void>;
      update: (ref: FakeDocumentReference, data: Record<string, unknown>) => Promise<void>;
    }) => Promise<T>,
  ): Promise<T> {
    const tx = {
      get: (ref: FakeDocumentReference) => ref.get(),
      set: (
        ref: FakeDocumentReference,
        data: Record<string, unknown>,
        options?: { merge?: boolean },
      ) => ref.set(data, options),
      update: (ref: FakeDocumentReference, data: Record<string, unknown>) => ref.update(data),
    };
    return updateFunction(tx);
  }

  reset() {
    this.store.clear();
    this.autoIdCounter = 0;
  }
}

export const createFakeFirestore = () => new FakeFirestore();
export const createFakeBucket = () => new FakeBucket();
