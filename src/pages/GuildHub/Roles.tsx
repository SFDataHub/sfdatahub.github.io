import React from "react";
import GuildContextBar from "../../components/guilds/GuildContextBar";
import { useGuildHubParams } from "./hooks/useGuildHubParams";

export default function GuildHubRoles() {
  useGuildHubParams();

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <GuildContextBar />
      <h1>Guild Hub - Roles</h1>
    </section>
  );
}
