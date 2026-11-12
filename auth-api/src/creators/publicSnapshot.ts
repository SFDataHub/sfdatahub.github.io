import { isYouTubeSnapshot, type YouTubeSnapshot } from "./types";

// Shared by routes and the central publisher within ONE warm process. Other
// instances/restarts have their own cache; no global read-count guarantee.
export class PublicYouTubeCache {
  private value: YouTubeSnapshot | null = null;
  private pending?: Promise<YouTubeSnapshot | null>;
  private revision = 0;
  private missingUntil = 0;
  expiresAt = 0;
  publish(snapshot: YouTubeSnapshot) {
    if (!isYouTubeSnapshot(snapshot)) return;
    this.revision++;
    this.value = snapshot;
    const now = Date.now(), boundary = (Math.floor((now - 120000) / 3600000) + 1) * 3600000 + 120000;
    this.expiresAt = Math.min(now + 60000, boundary);
    this.missingUntil = 0;
  }
  clear() { this.revision++; this.value = null; this.pending = undefined; this.expiresAt = this.missingUntil = 0; }
  read(load: () => Promise<YouTubeSnapshot | null>): Promise<YouTubeSnapshot | null> {
    if (this.value && Date.now() < this.expiresAt) return Promise.resolve(this.value);
    if (!this.value && Date.now() < this.missingUntil) return Promise.resolve(null);
    if (this.pending) return this.pending;
    const revision = this.revision;
    const request = load().then(snapshot => {
      // A central/manual publication wins over an older outstanding GET.
      if (revision !== this.revision) return this.value;
      if (snapshot && !isYouTubeSnapshot(snapshot)) throw new Error("Invalid public snapshot");
      if (snapshot) this.publish(snapshot);
      else if (this.value) { this.expiresAt = Date.now() + 5000; return this.value; }
      else this.missingUntil = Date.now() + 5000;
      return snapshot;
    }).catch(error => {
      if (this.value) {
        this.expiresAt = Date.now() + 5000;
        return this.value; // Preserve its actual successful timestamp.
      }
      throw error;
    });
    this.pending = request;
    void request.finally(() => { if (this.pending === request) this.pending = undefined; }).catch(() => {});
    return request;
  }
}
export const publicYouTubeCache = new PublicYouTubeCache();
