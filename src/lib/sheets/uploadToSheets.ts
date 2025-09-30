// src/lib/sheets/uploadToSheets.ts
export async function uploadScanToSheets(json: unknown) {
  const url = "https://script.google.com/macros/s/AKfycbxKUyihus18ksaIQWt-raYvIpuUC5TqtXFF2KvLVmGVDWWBTZYWAiiaos2nEOr7ZgE5/exec"; // z.B. https://script.google.com/macros/s/AKfycbx.../exec
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sheets upload failed: ${res.status} ${text}`);
  }
  return res.json();
}
