import React from "react";
import { useGuildHubParams } from "./hooks/useGuildHubParams";

export default function GuildHubImports() {
  useGuildHubParams();

  return (
    <section style={{ padding: 16 }}>
      <h1>Guild Hub - Imports</h1>
    </section>
  );
}
