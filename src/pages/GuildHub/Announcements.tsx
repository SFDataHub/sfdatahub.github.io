import GuildHubBackLink from "../../components/guildhub/GuildHubBackLink";
import { useGuildHubParams } from "./hooks/useGuildHubParams";

export default function GuildHubAnnouncements() {
  useGuildHubParams();

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <GuildHubBackLink />
      <h1>Guild Hub - Announcements</h1>
    </section>
  );
}
