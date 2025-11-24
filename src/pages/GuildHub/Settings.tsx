import React from "react";
import { useGuildHubParams } from "./hooks/useGuildHubParams";

export default function GuildHubSettings() {
  useGuildHubParams();

  return (
    <section style={{ padding: 16 }}>
      <h1>Guild Hub - Settings</h1>
    </section>
  );
}
