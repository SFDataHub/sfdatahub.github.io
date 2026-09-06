import React from "react";
import GuildHubBackLink from "../../components/guildhub/GuildHubBackLink";
import { useGuildHubParams } from "./hooks/useGuildHubParams";

export default function GuildHubSettings() {
  useGuildHubParams();

  return (
    <section style={{ padding: 16 }}>
      <GuildHubBackLink />
      <h1>Guild Hub - Settings</h1>
    </section>
  );
}
