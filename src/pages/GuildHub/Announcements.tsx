import React from "react";
import { useGuildHubParams } from "./hooks/useGuildHubParams";

export default function GuildHubAnnouncements() {
  useGuildHubParams();

  return (
    <section style={{ padding: 16 }}>
      <h1>Guild Hub - Announcements</h1>
    </section>
  );
}
