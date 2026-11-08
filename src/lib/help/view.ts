/** Shared by help rendering and its canonical statistics path. */
export function helpView(search: string, hash = "") {
  if (hash === "#linking") return "qa";
  const view = new URLSearchParams(search).get("view");
  return view === "wiki" || view === "qa" ? view : "overview";
}
