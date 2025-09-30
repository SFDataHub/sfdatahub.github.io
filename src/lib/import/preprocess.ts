// src/lib/import/preprocess.ts
// Minimaler Preprocess-Stub: gibt Payload unverändert zurück.
// (Platz für zukünftiges Auto-Mapping).

/**
 * Wendet (derzeit) kein Mapping an. Später können wir hier
 * JSON-Felder auf dein Zielschema mappen, bevor Zod validiert.
 */
export async function preprocessPlayersPayloadLike<T = any>(payload: T): Promise<T> {
  return payload;
}

/**
 * Siehe oben; für Guilds-Payloads.
 */
export async function preprocessGuildsPayloadLike<T = any>(payload: T): Promise<T> {
  return payload;
}
