import React from "react";
import {
  buildLocalPlayerInsights,
  type LocalPlayerAttributeComparison,
  type LocalPlayerInsightsModel,
} from "./localPlayerInsightsModel";
import type { LocalPlayerProfileModel } from "./types";

type LocalPlayerProfileInsightsProps = {
  profile: LocalPlayerProfileModel;
};

const EMPTY_MODEL: LocalPlayerInsightsModel = {
  status: "loading",
  rankings: {
    player: null,
    guild: null,
    server: null,
  },
  progression: {
    gameCompletion: null,
    itemsDiscovered: null,
  },
  playerVsAverage: [
    { key: "str", label: "Strength", playerValue: null, guildAverage: null, validGuildMembers: 0 },
    { key: "dex", label: "Dexterity", playerValue: null, guildAverage: null, validGuildMembers: 0 },
    { key: "int", label: "Intelligence", playerValue: null, guildAverage: null, validGuildMembers: 0 },
    { key: "con", label: "Constitution", playerValue: null, guildAverage: null, validGuildMembers: 0 },
    { key: "lck", label: "Luck", playerValue: null, guildAverage: null, validGuildMembers: 0 },
  ],
  personalBests: {
    highestXpPerDay: null,
    highestDungeon: null,
    bestServerRank: null,
    historyAvailable: false,
  },
};

export default function LocalPlayerProfileInsights({ profile }: LocalPlayerProfileInsightsProps) {
  const [model, setModel] = React.useState<LocalPlayerInsightsModel>(EMPTY_MODEL);

  React.useEffect(() => {
    let cancelled = false;
    setModel(EMPTY_MODEL);

    buildLocalPlayerInsights(profile)
      .then((nextModel) => {
        if (!cancelled) setModel(nextModel);
      })
      .catch((error) => {
        console.error("[LocalPlayerProfileInsights] failed to build insights", error);
        if (!cancelled) {
          setModel({
            ...EMPTY_MODEL,
            status: "error",
            message: "Insights konnten nicht geladen werden.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  return (
    <>
      <InsightPanel className="local-player-insights--rankings" title="RANKINGS & COMPARISON">
        <MetricList
          rows={[
            { label: "Player", value: formatRank(model.rankings.player) },
            { label: "Guild", value: formatRank(model.rankings.guild) },
            { label: "Server", value: formatRank(model.rankings.server) },
          ]}
        />
      </InsightPanel>

      <InsightPanel className="local-player-insights--progression" title="PROGRESSION">
        <MetricList
          rows={[
            { label: "GAME COMPLETION", value: formatPercent(model.progression.gameCompletion) },
            { label: "ITEMS DISCOVERED", value: formatNumber(model.progression.itemsDiscovered) },
          ]}
        />
      </InsightPanel>

      <InsightPanel className="local-player-insights--player-average" title="PLAYER VS AVERAGE">
        <div className="local-player-insights__attributes">
          {model.playerVsAverage.map((attribute) => (
            <AttributeComparison key={attribute.key} attribute={attribute} />
          ))}
        </div>
      </InsightPanel>

      <InsightPanel className="local-player-insights--personal-bests" title="PERSONAL BESTS">
        <MetricList
          rows={[
            { label: "HIGHEST XP / DAY", value: formatNumber(model.personalBests.highestXpPerDay) },
            { label: "HIGHEST DUNGEON", value: formatNumber(model.personalBests.highestDungeon) },
            { label: "BEST SERVER RANK", value: formatRank(model.personalBests.bestServerRank) },
          ]}
        />
        {model.status === "error" ? <p className="local-player-insights__note">{model.message}</p> : null}
      </InsightPanel>
    </>
  );
}

function InsightPanel({
  className,
  title,
  children,
}: {
  className: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`local-player-insights ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function MetricList({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <dl className="local-player-insights__metric-list">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AttributeComparison({ attribute }: { attribute: LocalPlayerAttributeComparison }) {
  const ratio =
    attribute.playerValue != null && attribute.guildAverage != null && attribute.guildAverage > 0
      ? Math.max(0, Math.min(1.4, attribute.playerValue / attribute.guildAverage)) / 1.4
      : 0;

  return (
    <div className="local-player-insights__attribute-row">
      <div className="local-player-insights__attribute-head">
        <span>{attribute.label}</span>
        <strong>{formatNumber(attribute.playerValue)}</strong>
      </div>
      <div className="local-player-insights__attribute-track" aria-hidden="true">
        <span style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <div className="local-player-insights__attribute-average">
        <span>Avg</span>
        <strong>{formatNumber(attribute.guildAverage, 1)}</strong>
      </div>
    </div>
  );
}

function formatNumber(value: number | null, maximumFractionDigits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("de-DE", { maximumFractionDigits });
}

function formatRank(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  return `#${value.toLocaleString("de-DE", { maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`;
}
