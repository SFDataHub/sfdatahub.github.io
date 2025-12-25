import React from "react";
import { useTranslation } from "react-i18next";
import ContentShell from "../../../components/ContentShell";
import HudBox from "../../../components/ui/hud/box/HudBox";
import styles from "./ServersOverview.module.css";
import serversOverviewConfig, {
  type ServersOverviewNode,
} from "./serversOverview.config";

type NodeRef = {
  node: ServersOverviewNode;
  isPlaceholder: boolean;
  key: string;
};

const resolveNode = (
  code: string,
  nodes: Record<string, ServersOverviewNode>,
): NodeRef => {
  const node = nodes[code];
  if (node) {
    return { node, isPlaceholder: false, key: node.code };
  }
  return {
    node: {
      code,
      displayName: code,
      type: "other",
      tier: 0,
      mergedFrom: [],
    },
    isPlaceholder: true,
    key: `placeholder:${code}`,
  };
};

const collectReachableNodes = (
  entrypoints: string[],
  nodes: Record<string, ServersOverviewNode>,
): Set<string> => {
  const visited = new Set<string>();
  const stack = [...entrypoints];

  while (stack.length) {
    const code = stack.pop();
    if (!code || visited.has(code)) continue;
    visited.add(code);
    const children = nodes[code]?.mergedFrom ?? [];
    children.forEach((child) => {
      if (!visited.has(child)) {
        stack.push(child);
      }
    });
  }

  return visited;
};

type NodeCardProps = {
  node: ServersOverviewNode;
  hasChildren: boolean;
  isExpanded: boolean;
  isPlaceholder: boolean;
  onToggle: () => void;
};

function NodeCard({
  node,
  hasChildren,
  isExpanded,
  isPlaceholder,
  onToggle,
}: NodeCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={styles.nodeButton}
      aria-expanded={hasChildren ? isExpanded : undefined}
    >
      <HudBox
        hover
        className={[
          styles.nodeCard,
          isPlaceholder ? styles.placeholder : "",
        ].join(" ")}
      >
        <div className={styles.nodeTitleRow}>
          <div className={styles.nodeTitle}>{node.displayName || node.code}</div>
          {hasChildren ? (
            <span className={styles.nodeToggle} aria-hidden>
              {isExpanded ? "-" : "+"}
            </span>
          ) : null}
        </div>
        <div className={styles.nodeMeta}>
          <span className={styles.nodeCode}>{node.code}</span>
        </div>
      </HudBox>
    </button>
  );
}

function ServersOverviewTree() {
  const { t } = useTranslation();
  const { entrypoints, nodes } = serversOverviewConfig;
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(),
  );

  const handleToggle = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpanded(collectReachableNodes(entrypoints, nodes));
  };

  const handleCollapseAll = () => {
    setExpanded(new Set());
  };

  const renderNode = (code: string, ancestry: Set<string>): React.ReactNode => {
    if (ancestry.has(code)) {
      return null;
    }
    const ref = resolveNode(code, nodes);
    const children = ref.node.mergedFrom ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(code);
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(code);

    return (
      <li key={ref.key} className={styles.nodeItem}>
        <NodeCard
          node={ref.node}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          isPlaceholder={ref.isPlaceholder}
          onToggle={() => handleToggle(code)}
        />
        {hasChildren && isExpanded ? (
          <ul className={styles.nodeChildren}>
            {children.map((child) => renderNode(child, nextAncestry))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.controlsRow}>
        <div className={`${styles.controls} ${styles.desktopOnly}`}>
          <button
            type="button"
            onClick={handleExpandAll}
            className={styles.controlButton}
          >
            {t("servers.overview.expandAll")}
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className={styles.controlButton}
          >
            {t("servers.overview.collapseAll")}
          </button>
        </div>
      </div>

      <div className={styles.entryGrid}>
        {entrypoints.map((code) => {
          const ref = resolveNode(code, nodes);
          const children = ref.node.mergedFrom ?? [];
          const hasChildren = children.length > 0;
          const isExpanded = expanded.has(code);

          return (
            <div key={ref.key} className={styles.entryItem}>
              <NodeCard
                node={ref.node}
                hasChildren={hasChildren}
                isExpanded={isExpanded}
                isPlaceholder={ref.isPlaceholder}
                onToggle={() => handleToggle(code)}
              />
              {hasChildren && isExpanded ? (
                <ul className={styles.nodeList}>
                  {children.map((child) => renderNode(child, new Set([code])))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ServersOverviewPage() {
  const { t } = useTranslation();

  return (
    <ContentShell title={t("servers.overview.pageTitle")} centerFramed={false} padded>
      <ServersOverviewTree />
    </ContentShell>
  );
}
