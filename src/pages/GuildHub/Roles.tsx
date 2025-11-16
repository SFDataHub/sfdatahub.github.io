import React from "react";
import { useGuildHubParams } from "./hooks/useGuildHubParams";

export default function GuildHubRoles() {
  useGuildHubParams();

  return (
    <section style={{ padding: 16 }}>
      <h1>Guild Hub - Roles</h1>
    </section>
  );
}
