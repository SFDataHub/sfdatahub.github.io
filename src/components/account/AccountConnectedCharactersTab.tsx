import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AuthUser, LinkedPlayer } from "../../lib/auth/types";
import { AUTH_BASE_URL } from "../../lib/auth/config";
import accountStyles from "../../pages/Settings/AccountSettingsPage.module.css";
import styles from "./AccountConnectedCharactersTab.module.css";

type AccountConnectedCharactersTabProps = {
  user: AuthUser;
  refreshSession: (options?: { silent?: boolean }) => Promise<void>;
  openHelp?: boolean;
};

const formatTimestamp = (value?: string): string => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const getCharacterName = (player: LinkedPlayer): string => {
  const trimmed = player.name?.trim();
  if (trimmed) return trimmed;
  if (player.playerId !== undefined && player.playerId !== null) {
    return `#${player.playerId}`;
  }
  return "-";
};

const AccountConnectedCharactersTab: React.FC<AccountConnectedCharactersTabProps> = ({
  user,
  refreshSession,
  openHelp = false,
}) => {
  const { t } = useTranslation();
  const linkedPlayers = useMemo(() => user.linkedPlayers ?? [], [user.linkedPlayers]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [confirmingPlayer, setConfirmingPlayer] = useState<LinkedPlayer | null>(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(() => openHelp || linkedPlayers.length === 0);
  const unlinkEndpoint = useMemo(
    () => (AUTH_BASE_URL ? `${AUTH_BASE_URL}/user/unlink-character` : ""),
    [],
  );

  React.useEffect(() => {
    if (openHelp) {
      setIsHelpOpen(true);
    }
  }, [openHelp]);

  React.useEffect(() => {
    if (linkedPlayers.length === 0) {
      setIsHelpOpen(true);
    }
  }, [linkedPlayers.length]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshSession({ silent: true });
    } catch (error) {
      console.error("[Account] Failed to refresh linked players", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRequestUnlink = (player: LinkedPlayer) => {
    setConfirmingPlayer(player);
    setUnlinkError(null);
  };

  const closeDialog = () => {
    if (isUnlinking) return;
    setConfirmingPlayer(null);
    setUnlinkError(null);
  };

  const unlinkCharacter = async () => {
    if (!confirmingPlayer) return;
    if (!unlinkEndpoint) {
      setUnlinkError(
        t(
          "account.connectedCharacters.errors.serviceUnavailable",
          "Auth service is not configured for unlinking.",
        ),
      );
      return;
    }

    setIsUnlinking(true);
    setIsRefreshing(true);
    setUnlinkError(null);

    try {
      const response = await fetch(unlinkEndpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playerId: confirmingPlayer.playerId,
          server: confirmingPlayer.server,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error ||
          payload?.message ||
          t("account.connectedCharacters.errors.unlink", "Could not unlink character.");
        throw new Error(message);
      }

      await refreshSession({ silent: true });
      setConfirmingPlayer(null);
    } catch (error: any) {
      const message = error?.message ?? t("account.connectedCharacters.errors.unlink", "Could not unlink character.");
      setUnlinkError(message);
    } finally {
      setIsUnlinking(false);
      setIsRefreshing(false);
    }
  };

  const renderSource = (method?: string) => {
    if (!method) return "-";
    if (method.startsWith("discord_")) {
      return t("account.connectedCharacters.method.discord", "Discord bot");
    }
    return method;
  };

  const helpSteps = useMemo(
    () => [
      t(
        "account.connectedCharacters.help.steps.link",
        'Link a character via the Discord bot using the "!connect char" command.',
      ),
      t(
        "account.connectedCharacters.help.steps.verify",
        "We match the character to your latest verified scan; keep your game data up to date.",
      ),
      t(
        "account.connectedCharacters.help.steps.refresh",
        "After linking, click Refresh here to sync the latest characters from the auth service.",
      ),
      t(
        "account.connectedCharacters.help.steps.unlink",
        "You can unlink any character in the Actions column; the source column shows how it was linked.",
      ),
    ],
    [t],
  );

  const renderHelpAccordion = () => {
    const helpContentId = "connected-characters-help";
    return (
      <div className={styles.helpAccordion}>
        <button
          type="button"
          className={`${styles.helpToggle} ${isHelpOpen ? styles.helpToggleOpen : ""}`}
          aria-expanded={isHelpOpen}
          aria-controls={helpContentId}
          onClick={() => setIsHelpOpen((prev) => !prev)}
        >
          <span>{t("account.connectedCharacters.help.title", "How does linking work?")}</span>
          <span className={styles.helpToggleAction}>
            {isHelpOpen
              ? t("account.connectedCharacters.help.hide", "Hide")
              : t("account.connectedCharacters.help.show", "Show")}
          </span>
        </button>
        {isHelpOpen && (
          <div id={helpContentId} className={styles.helpBody}>
            <ul className={styles.helpList}>
              {helpSteps.map((step, index) => (
                <li key={`help-step-${index}`} className={styles.helpListItem}>{step}</li>
              ))}
            </ul>
            <p className={styles.helpFootnote}>
              {t(
                "account.connectedCharacters.help.footnote",
                "Tip: Click Refresh after linking or unlinking to update this table.",
              )}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderTable = () => (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t("account.connectedCharacters.columns.character", "Character")}</th>
            <th>{t("account.connectedCharacters.columns.server", "Server")}</th>
            <th>{t("account.connectedCharacters.columns.playerId", "Player ID")}</th>
            <th>{t("account.connectedCharacters.columns.class", "Class")}</th>
            <th>{t("account.connectedCharacters.columns.level", "Level")}</th>
            <th>{t("account.connectedCharacters.columns.guild", "Guild")}</th>
            <th>{t("account.connectedCharacters.columns.lastVerified", "Last linked")}</th>
            <th>{t("account.connectedCharacters.columns.source", "Source")}</th>
            <th className={styles.actionsHeader}>
              {t("account.connectedCharacters.columns.actions", "Actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {linkedPlayers.map((player, index) => {
            const rowKey = `${player.server ?? "unknown"}-${player.playerId ?? index}`;
            const levelValue = player.level ?? "-";
            const guildValue = player.guildName || "-";
            const classValue = player.class || "-";
            const sourceValue = renderSource(player.method);

            return (
              <tr key={rowKey} className={styles.tableRow}>
                <td>{getCharacterName(player)}</td>
                <td>{player.server || "-"}</td>
                <td>{player.playerId ?? "-"}</td>
                <td className={!player.class ? styles.muted : undefined}>{classValue}</td>
                <td className={typeof player.level !== "number" ? styles.muted : undefined}>{levelValue}</td>
                <td className={!player.guildName ? styles.muted : undefined}>{guildValue}</td>
                <td className={styles.dateCell}>{formatTimestamp(player.verifiedAt)}</td>
                <td className={!player.method ? styles.muted : undefined}>{sourceValue}</td>
                <td className={styles.actionCell}>
                  <button
                    type="button"
                    className={styles.unlinkButton}
                    onClick={() => handleRequestUnlink(player)}
                    title={t("account.connectedCharacters.actions.unlink", "Disconnect character")}
                    aria-label={`${t("account.connectedCharacters.actions.unlink", "Disconnect character")} ${getCharacterName(player)}`}
                    disabled={isUnlinking || isRefreshing}
                  >
                    <svg className={styles.unlinkIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path
                        fill="currentColor"
                        d="M9 4h6a1 1 0 0 1 1 1v2h5v2h-2.1l-1.05 11.2A2 2 0 0 1 15.86 22H8.14a2 2 0 0 1-1.99-1.8L5.1 9H3V7h5V5a1 1 0 0 1 1-1Zm5 2V6H10v2h4Zm-6.93 3 1.02 10.8a1 1 0 0 0 1 .9h7.72a1 1 0 0 0 1-.9L18.83 9ZM10 11v7h2v-7Zm4 0v7h2v-7Z"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderConfirmationDialog = () => {
    if (!confirmingPlayer) return null;

    const dialogTitleId = "unlink-dialog-title";

    return (
      <div className={styles.confirmBackdrop} role="dialog" aria-modal="true" aria-labelledby={dialogTitleId}>
        <div className={styles.confirmDialog}>
          <h3 id={dialogTitleId} className={styles.confirmTitle}>
            {t(
              "account.connectedCharacters.confirmation.title",
              "Are you sure you want to unlink this character?",
            )}
          </h3>
          <p className={styles.confirmText}>
            <span className={styles.confirmName}>{getCharacterName(confirmingPlayer)}</span>
            <span className={styles.confirmMeta}>
              {confirmingPlayer.server || "-"} - #{confirmingPlayer.playerId ?? "-"}
            </span>
          </p>
          {unlinkError && <p className={styles.errorText}>{unlinkError}</p>}
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={closeDialog}
              disabled={isUnlinking}
            >
              {t("account.connectedCharacters.confirmation.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className={styles.confirmButton}
              onClick={unlinkCharacter}
              disabled={isUnlinking}
            >
              {isUnlinking
                ? t("account.connectedCharacters.confirmation.confirming", "Unlinking...")
                : t("account.connectedCharacters.confirmation.confirm", "Yes, unlink")}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!user) return null;

  return (
    <section className={accountStyles.card}>
      <div className={styles.header}>
        <div className={styles.headerTexts}>
          <h2 className={accountStyles.cardTitle}>
            {t("account.connectedCharacters.title", "Connected characters")}
          </h2>
          <p className={accountStyles.cardSubtitle}>
            {t("account.connectedCharacters.subtitle", "These game characters are linked to your SFDataHub account.")}
          </p>
        </div>
        <button
          type="button"
          className={accountStyles.secondaryButton}
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing
            ? t("account.connectedCharacters.actions.refreshing", "Refreshing...")
            : t("account.connectedCharacters.actions.refresh", "Refresh")}
        </button>
      </div>

      {isRefreshing && (
        <p className={accountStyles.helperText}>
          {t("account.connectedCharacters.loading", "Refreshing characters...")}
        </p>
      )}

      {renderHelpAccordion()}

      {!isRefreshing && linkedPlayers.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>
            {t("account.connectedCharacters.empty.title", "No characters linked yet")}
          </p>
          <p className={styles.emptyDescription}>
            {t(
              "account.connectedCharacters.empty.description",
              'Use the "!connect char" command in Discord to link your characters, then click "Refresh" here.',
            )}
          </p>
          <button
            type="button"
            className={styles.emptyCta}
            onClick={() => setIsHelpOpen(true)}
          >
            {t("account.connectedCharacters.empty.cta", "Click to learn how linking works")}
          </button>
        </div>
      )}

      {linkedPlayers.length > 0 && renderTable()}
      {renderConfirmationDialog()}
    </section>
  );
};

export default AccountConnectedCharactersTab;
