import type { Request, Response } from "express";
import { db } from "../firebase";
import { createCatalogReader } from "./reader";
import { readCatalog } from "./storage";

const read = createCatalogReader(() => readCatalog(async path => (await db.doc(path).get()).data()));
export async function creatorHubHandler(_req: Request, res: Response) {
  // Browser TTL is bounded separately. No intermediary cache hides a read failure.
  res.setHeader("Cache-Control", "no-store");
  try { return res.json(await read()); }
  catch { return res.status(503).json({ error: "CREATOR_CATALOG_UNAVAILABLE" }); }
}
