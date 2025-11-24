import React from "react";
import { useGuildHubParams } from "./hooks/useGuildHubParams";

export default function GuildHubActivity() {
  useGuildHubParams();

  return (
    <section style={{ padding: 16 }}>
      <h1>Guild Hub - Activity</h1>
    </section>
  );
}
