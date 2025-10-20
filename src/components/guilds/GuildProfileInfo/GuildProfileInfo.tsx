// src/components/guilds/GuildProfileInfo/GuildProfileInfo.tsx
import React, { memo } from "react";
import styles from "./GuildProfileInfo.module.css";
import type { GuildProfileInfoProps } from "./GuildProfileInfo.types";

function Section({
  title,
  right,
  children,
  colors,
}: {
  title?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  colors: GuildProfileInfoProps["colors"];
}) {
  return (
    <div
      className="rounded-2xl shadow-lg"
      style={{ background: colors.tile, border: `1px solid ${colors.line}` }}
    >
      {(title || right) && (
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: colors.line }}
        >
          <div className="text-sm tracking-wide uppercase" style={{ color: colors.soft }}>
            {title}
          </div>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function StatRow({
  k,
  v,
  colors,
}: {
  k: string;
  v: React.ReactNode;
  colors: GuildProfileInfoProps["colors"];
}) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="opacity-80">{k}</span>
      <span className="font-semibold" style={{ color: colors.title }}>
        {v}
      </span>
    </div>
  );
}

const GuildProfileInfo = memo(function GuildProfileInfo({
  guild,
  snapshot,
  emblemUrl,
  colors,
}: GuildProfileInfoProps) {
  return (
    <div className={styles.root + " space-y-4"}>
      {/* KPIs */}
      <Section colors={colors}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 text-sm">
          <StatRow k="ø Treasury" v={snapshot?.avgTreasury ?? "—"} colors={colors} />
          <StatRow k="# on Server" v={1} colors={colors} />
          <StatRow k="ø Mine" v={snapshot?.avgMine ?? "—"} colors={colors} />
          <StatRow k="# in Europe" v={6} colors={colors} />
          <StatRow k="ø level" v={snapshot?.avgLevel ?? "—"} colors={colors} />
        </div>
      </Section>

      {/* BASE STATS */}
      <Section title="BASE STATS" colors={colors}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div
              className="rounded-xl p-4"
              style={{ background: colors.tileAlt, border: `1px solid ${colors.line}` }}
            >
              <StatRow k="player in Top 100 on Server" v={41} colors={colors} />
              <StatRow k="player in Top 100 each class" v={42} colors={colors} />
              <StatRow k="player in Top 1000" v={45} colors={colors} />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                className="px-4 py-2 rounded-xl text-sm text-white"
                style={{ background: colors.header, border: `1px solid ${colors.line}` }}
              >
                highest in ..
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="opacity-80 mb-1">Main</div>
                <div className="font-semibold" style={{ color: colors.title }}>
                  {snapshot?.avgBaseMain ?? "—"}
                </div>
              </div>
              <div>
                <div className="opacity-80 mb-1">Con</div>
                <div className="font-semibold" style={{ color: colors.title }}>
                  {snapshot?.avgConBase ?? "—"}
                </div>
              </div>
              <div>
                <div className="opacity-80 mb-1">Sum Base Stats</div>
                <div className="font-semibold" style={{ color: colors.title }}>
                  {snapshot?.avgSumBaseTotal ?? "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="opacity-80">Top Player</div>
                <div className="font-semibold" style={{ color: colors.title }}>—</div>
              </div>
              <div>
                <div className="opacity-80">2nd</div>
                <div className="font-semibold" style={{ color: colors.title }}>—</div>
              </div>
              <div>
                <div className="opacity-80">3rd</div>
                <div className="font-semibold" style={{ color: colors.title }}>—</div>
              </div>
            </div>

            <div
              className="rounded-xl p-4"
              style={{ background: colors.tileAlt, border: `1px solid ${colors.line}` }}
            >
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="opacity-80">⌀</div>
                <div className="text-right opacity-80">—</div>
                <div>Main</div>
                <div className="text-right font-semibold" style={{ color: colors.title }}>
                  {snapshot?.avgAttrTotal ?? "—"}
                </div>
                <div>Con</div>
                <div className="text-right font-semibold" style={{ color: colors.title }}>
                  {snapshot?.avgConTotal ?? "—"}
                </div>
                <div>Total Stats</div>
                <div className="text-right font-semibold" style={{ color: colors.title }}>
                  {snapshot?.avgTotalStats ?? "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* JOINED / LEFT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="PLAYER JOINED" colors={colors}>
          <div className="text-sm opacity-70">—</div>
        </Section>
        <Section title="PLAYER LEFT" colors={colors}>
          <div className="text-sm opacity-70">—</div>
        </Section>
      </div>
    </div>
  );
});

export default GuildProfileInfo;
