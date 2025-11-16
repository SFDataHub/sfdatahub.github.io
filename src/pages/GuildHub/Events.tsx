import React from "react";
import { useGuildHubParams } from "./hooks/useGuildHubParams";

export default function GuildHubEvents() {
  useGuildHubParams();

  return (
    <section style={{ padding: 16 }}>
      <h1>Guild Hub - Events</h1>
    </section>
  );
}
