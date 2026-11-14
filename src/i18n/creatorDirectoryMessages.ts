const en = {
  title: "Creator overview", description: "Discover YouTube and Twitch channels in one place",
  search: "Search creators, channels or platform IDs", platform: "Platform", all: "All", language: "Languages", allLanguages: "All languages",
  languageUnknown: "Language unavailable", creator: "Creator", details: "Creator details", add: "Add creator", edit: "Edit channels / sources",
  editUnavailable: "Editing is not available yet.", loading: "Loading creators…", loadError: "The creator catalog could not be loaded.",
  stale: "The catalog could not be refreshed. Previously loaded creators are still shown.",
  noResults: "No creators match these filters.", noCreators: "No creators are available in the catalog yet.", selectCreator: "Select a creator to view their channels.",
  channelNote: "These channels belong to the same creator. Channel names may differ.",
  openChannel: "Open {{name}} on {{platform}} in a new tab", avatar: "{{name}} channel image", imageUnavailable: "Image unavailable",
  results_one: "{{count}} creator", results_other: "{{count}} creators",
};
type Messages = Record<keyof typeof en, string>;
const de: Messages = {
  title: "Creatorübersicht", description: "YouTube- und Twitch-Kanäle gemeinsam entdecken",
  search: "Creator, Kanäle oder Plattformkennungen suchen", platform: "Plattform", all: "Alle", language: "Sprachen", allLanguages: "Alle Sprachen",
  languageUnknown: "Sprache nicht verfügbar", creator: "Creator", details: "Creator-Details", add: "Creator ergänzen", edit: "Kanäle / Quellen bearbeiten",
  editUnavailable: "Die Bearbeitung ist noch nicht verfügbar.", loading: "Creator werden geladen…", loadError: "Der Creatorkatalog konnte nicht geladen werden.",
  stale: "Der Katalog konnte nicht aktualisiert werden. Bereits geladene Creator werden weiterhin angezeigt.",
  noResults: "Keine Creator für diese Filter gefunden.", noCreators: "Im Katalog sind noch keine Creator verfügbar.", selectCreator: "Wähle einen Creator, um seine Kanäle anzuzeigen.",
  channelNote: "Diese Kanäle gehören zu demselben Creator. Unterschiedliche Kanalnamen sind möglich.",
  openChannel: "{{name}} auf {{platform}} in einem neuen Tab öffnen", avatar: "Kanalbild von {{name}}", imageUnavailable: "Bild nicht verfügbar",
  results_one: "{{count}} Creator", results_other: "{{count}} Creator",
};
const hu: Messages = {
  title: "Tartalomkészítők", description: "YouTube- és Twitch-csatornák egy helyen",
  search: "Készítő, csatorna vagy platformazonosító keresése", platform: "Platform", all: "Összes", language: "Nyelvek", allLanguages: "Minden nyelv",
  languageUnknown: "A nyelv nem érhető el", creator: "Készítő", details: "A készítő adatai", add: "Készítő hozzáadása", edit: "Csatornák / források szerkesztése",
  editUnavailable: "A szerkesztés még nem érhető el.", loading: "Készítők betöltése…", loadError: "A készítők katalógusa nem tölthető be.",
  stale: "A katalógus frissítése sikertelen. A korábban betöltött készítők továbbra is láthatók.",
  noResults: "Nincs a szűrőknek megfelelő készítő.", noCreators: "Még nincsenek készítők a katalógusban.", selectCreator: "Válassz egy készítőt a csatornái megtekintéséhez.",
  channelNote: "Ezek a csatornák ugyanahhoz a készítőhöz tartoznak. A csatornanevek eltérhetnek.",
  openChannel: "{{name}} megnyitása a(z) {{platform}} platformon új lapon", avatar: "{{name}} csatornaképe", imageUnavailable: "A kép nem érhető el",
  results_one: "{{count}} készítő", results_other: "{{count}} készítő",
};
const cs: Messages & { results_few: string; results_many: string } = {
  title: "Přehled tvůrců", description: "Objevujte kanály na YouTube a Twitchi na jednom místě",
  search: "Hledat tvůrce, kanály nebo identifikátory platforem", platform: "Platforma", all: "Vše", language: "Jazyky", allLanguages: "Všechny jazyky",
  languageUnknown: "Jazyk není k dispozici", creator: "Tvůrce", details: "Podrobnosti o tvůrci", add: "Přidat tvůrce", edit: "Upravit kanály / zdroje",
  editUnavailable: "Úpravy zatím nejsou k dispozici.", loading: "Načítání tvůrců…", loadError: "Katalog tvůrců se nepodařilo načíst.",
  stale: "Katalog se nepodařilo aktualizovat. Dříve načtení tvůrci se stále zobrazují.",
  noResults: "Žádní tvůrci neodpovídají těmto filtrům.", noCreators: "V katalogu zatím nejsou žádní tvůrci.", selectCreator: "Vyberte tvůrce a zobrazte jeho kanály.",
  channelNote: "Tyto kanály patří stejnému tvůrci. Názvy kanálů se mohou lišit.",
  openChannel: "Otevřít {{name}} na platformě {{platform}} na nové kartě", avatar: "Obrázek kanálu {{name}}", imageUnavailable: "Obrázek není k dispozici",
  results_one: "{{count}} tvůrce", results_few: "{{count}} tvůrci", results_many: "{{count}} tvůrce", results_other: "{{count}} tvůrců",
};
const pl: Messages & { results_few: string; results_many: string } = {
  title: "Przegląd twórców", description: "Odkrywaj kanały YouTube i Twitch w jednym miejscu",
  search: "Szukaj twórców, kanałów lub identyfikatorów platform", platform: "Platforma", all: "Wszystkie", language: "Języki", allLanguages: "Wszystkie języki",
  languageUnknown: "Język niedostępny", creator: "Twórca", details: "Szczegóły twórcy", add: "Dodaj twórcę", edit: "Edytuj kanały / źródła",
  editUnavailable: "Edycja nie jest jeszcze dostępna.", loading: "Ładowanie twórców…", loadError: "Nie udało się wczytać katalogu twórców.",
  stale: "Nie udało się odświeżyć katalogu. Wcześniej wczytani twórcy są nadal wyświetlani.",
  noResults: "Żaden twórca nie pasuje do tych filtrów.", noCreators: "W katalogu nie ma jeszcze twórców.", selectCreator: "Wybierz twórcę, aby zobaczyć jego kanały.",
  channelNote: "Te kanały należą do tego samego twórcy. Nazwy kanałów mogą się różnić.",
  openChannel: "Otwórz {{name}} na platformie {{platform}} w nowej karcie", avatar: "Obraz kanału {{name}}", imageUnavailable: "Obraz niedostępny",
  results_one: "{{count}} twórca", results_few: "{{count}} twórców", results_many: "{{count}} twórców", results_other: "{{count}} twórcy",
};
export const creatorDirectoryMessages = { en, de, hu, cs, pl };
