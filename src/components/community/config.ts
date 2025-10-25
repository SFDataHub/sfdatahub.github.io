export type Category = {
  key: string;                // Tab Key für ?tab=...
  label: string;              // i18n Key / Klartext
  to: string;                 // Zielroute mit ?tab=...
  icon?: string;              // optionales Icon
  side?: "left" | "right";    // wo soll der Halbkreis erscheinen (left/rechts)
  sub?: Array<{ key: string; label: string; to: string; icon?: string }>; // Unterkategorien
};

// Hauptkategorien für den Community Hub
export const categories: Category[] = [
  { key: "creators",    label: "Creators",    to: "/community?tab=creators",     side: "left" },
  { key: "scans",       label: "Scans",       to: "/community?tab=scans",        side: "left" },
  { key: "predictions", label: "Predictions", to: "/community?tab=predictions", side: "left" },
  { key: "news",        label: "News",        to: "/community?tab=news",         side: "right" },

  { key: "feedback",    label: "Feedback",    to: "/community?tab=feedback",     side: "right" },
];

// Beispiel-Subkategorien für die jeweilige Hauptkategorie
export const subcategories: Record<string, Category["sub"]> = {
  creators: [
    { key: "streamers", label: "Streamers", to: "/community?tab=creators&sub=streamers" },
    { key: "youtubers", label: "YouTubers", to: "/community?tab=creators&sub=youtubers" },
  ],
  scans: [
    { key: "uploads", label: "Uploads", to: "/community?tab=scans&sub=uploads" },
    { key: "downloads", label: "Downloads", to: "/community?tab=scans&sub=downloads" },
  ],
  predictions: [
    { key: "votes", label: "Votes", to: "/community?tab=predictions&sub=votes" },
    { key: "tipps", label: "Tipps", to: "/community?tab=predictions&sub=tipps" },
  ],
  news: [
    { key: "updates", label: "Updates", to: "/community?tab=news&sub=updates" },
    { key: "announcements", label: "Announcements", to: "/community?tab=news&sub=announcements" },
  ],
  feedback: [
    { key: "bugreports", label: "Bugreports", to: "/community?tab=feedback&sub=bugreports" },
    { key: "features", label: "Feature Requests", to: "/community?tab=feedback&sub=features" },
  ],
};
