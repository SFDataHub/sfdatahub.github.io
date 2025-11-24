import React from "react";
import HudLabel from "../../../ui/hud/HudLabel";
import { getClassIconUrl } from "../../../ui/shared/classIcons";
import cls from "./TotalStatsCard.module.css";
import type { MembersSnapshotLike, PaletteColors } from "../GuildProfileInfo.types";

type Props = {
  snapshot: MembersSnapshotLike | null;
  colors: PaletteColors;
  title?: string;
};

function Chip({ name, value, classLabel, colors }:{
  name?: string | null; value: number | null | undefined; classLabel?: string | null;
  colors: PaletteColors;
}) {
  const url = getClassIconUrl(classLabel, 64);
  return (
    <div className={cls.chip}>
      <span className={cls.badge}>{url ? <img src={url} alt="" /> : null}</span>
      <span className={cls.name}>{name ?? "—"}</span>
      <span className={cls.score} style={{ color: colors.title }}>
        {typeof value === "number" ? value.toLocaleString("de-DE") : "—"}
      </span>
    </div>
  );
}

export default function TotalStatsCard({ snapshot, colors, title = "Total Stats" }: Props) {
  const members = snapshot?.members ?? [];
  const topN = (key: "attrTotal" | "conTotal" | "totalStats") =>
    [...members]
      .filter(m => typeof (m as any)[key] === "number")
      .sort((a, b) => ((b as any)[key] ?? 0) - ((a as any)[key] ?? 0))
      .slice(0, 3);

  const rows = [
    { label: "main",  avg: snapshot?.avgAttrTotal,  list: topN("attrTotal"),  key: "attrTotal"  as const },
    { label: "con",   avg: snapshot?.avgConTotal,   list: topN("conTotal"),   key: "conTotal"   as const },
    { label: "total", avg: snapshot?.avgTotalStats, list: topN("totalStats"), key: "totalStats" as const },
  ];

  return (
    <div className={cls.card}>
      <HudLabel text={title} />
      <div className={cls.headerSpacer} />
      <div className={cls.wrap}>
        <div className={cls.divider} />
        <div className={cls.rows}>
          {rows.map((r, i) => (
            <div key={i} className={cls.row}>
              <div className={cls.left}>
                <div className={cls.label}>{r.label}</div>
                <div className={cls.avgHead}>Ø</div>
                <div className={cls.avgNum} style={{ color: colors.title }}>
                  {typeof r.avg === "number" ? r.avg.toLocaleString("de-DE") : "—"}
                </div>
              </div>
              <div className={cls.top3}>
                {r.list.map((m, idx) => (
                  <Chip
                    key={idx}
                    name={m.name}
                    value={(m as any)[r.key] as number | undefined}
                    classLabel={m.class}
                    colors={colors}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
