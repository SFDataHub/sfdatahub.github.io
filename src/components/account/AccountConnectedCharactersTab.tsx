import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AuthUser, LinkedPlayer } from "../../lib/auth/types";
import { AUTH_BASE_URL } from "../../lib/auth/config";
import { saveAvatarSnapshotForIdentifier } from "../../lib/firebase/avatarSnapshots";
import { parseSfJson, type SfJsonOwnPlayer } from "../../lib/parsing";
import accountStyles from "../../pages/Settings/AccountSettingsPage.module.css";
import styles from "./AccountConnectedCharactersTab.module.css";

type AccountConnectedCharactersTabProps = {
  user: AuthUser;
  refreshSession: (options?: { silent?: boolean }) => Promise<boolean>;
  openHelp?: boolean;
};

const AVATAR_IMPORT_NO_OWN_PLAYER_ERROR = "SF_JSON_NO_OWN_PLAYER";

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

const buildAvatarImportNoOwnPlayerMessage = (t: (key: string, defaultValue: string) => string): string =>
  [
    t("account.connectedCharacters.avatarImport.errors.publicExport.title", "Avatar import failed."),
    t(
      "account.connectedCharacters.avatarImport.errors.publicExport.exportHint",
      'Make sure you exported your JSON from SFTools WITHOUT enabling "Export only public data ...".',
    ),
    t(
      "account.connectedCharacters.avatarImport.errors.publicExport.ownHint",
      'Your export must include your own character (an entry with "own": 1); otherwise avatar data is missing.',
    ),
    t(
      "account.connectedCharacters.avatarImport.errors.publicExport.quickCheck",
      'Quick check: search the file for "own": 1',
    ),
  ].join("\n");

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
  const [avatarImportJson, setAvatarImportJson] = useState("");
  const [avatarImportCandidates, setAvatarImportCandidates] = useState<SfJsonOwnPlayer[]>([]);
  const [selectedImportIdentifier, setSelectedImportIdentifier] = useState("");
  const [isAvatarImporting, setIsAvatarImporting] = useState(false);
  const [avatarImportError, setAvatarImportError] = useState<string | null>(null);
  const [avatarImportStatus, setAvatarImportStatus] = useState<string | null>(null);
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

  const handleAvatarJsonFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      setAvatarImportJson(text);
      setAvatarImportCandidates([]);
      setSelectedImportIdentifier("");
      setAvatarImportError(null);
      setAvatarImportStatus(
        t("account.connectedCharacters.avatarImport.fileLoaded", "JSON loaded. Click import to save the avatar."),
      );
    } catch (error) {
      console.error("[Account] Failed to read avatar JSON file", error);
      setAvatarImportStatus(null);
      setAvatarImportError(
        t("account.connectedCharacters.avatarImport.errors.fileRead", "Could not read the selected JSON file."),
      );
    }
  };

  const resolveAvatarImportSelection = (players: SfJsonOwnPlayer[]): SfJsonOwnPlayer | null => {
    if (!players.length) return null;
    if (!selectedImportIdentifier) return players[0];
    return players.find((player) => player.identifier === selectedImportIdentifier) ?? players[0];
  };

  const handleImportAvatarFromJson = async () => {
    setAvatarImportError(null);
    setAvatarImportStatus(null);

    if (!avatarImportJson.trim()) {
      setAvatarImportError(
        t("account.connectedCharacters.avatarImport.errors.empty", "Paste an SF JSON or choose a JSON file first."),
      );
      return;
    }

    try {
      const parsed = parseSfJson(avatarImportJson);
      const ownPlayers = parsed.ownPlayers;
      setAvatarImportCandidates(ownPlayers);

      if (!ownPlayers.length) {
        throw new Error(AVATAR_IMPORT_NO_OWN_PLAYER_ERROR);
      }

      const currentSelectionValid = ownPlayers.some((player) => player.identifier === selectedImportIdentifier);
      if (ownPlayers.length > 1 && !currentSelectionValid) {
        const firstIdentifier = ownPlayers[0]?.identifier ?? "";
        setSelectedImportIdentifier(firstIdentifier);
        setAvatarImportStatus(
          t(
            "account.connectedCharacters.avatarImport.multipleFound",
            "Multiple own characters found. Select one below, then click import again.",
          ),
        );
        return;
      }

      const selectedPlayer = resolveAvatarImportSelection(ownPlayers);
      if (!selectedPlayer) {
        throw new Error(
          t("account.connectedCharacters.avatarImport.errors.noSelection", "No character selected for avatar import."),
        );
      }
      if (!selectedPlayer.portrait) {
        throw new Error(
          t(
            "account.connectedCharacters.avatarImport.errors.noPortrait",
            "No portrait save data was found for the selected character.",
          ),
        );
      }

      setIsAvatarImporting(true);
      await saveAvatarSnapshotForIdentifier({
        userId: user.id,
        identifier: selectedPlayer.identifier,
        playerId: selectedPlayer.playerId,
        server: selectedPlayer.server,
        source: "connectChar",
        portrait: selectedPlayer.portrait,
      });

      setAvatarImportStatus(
        t(
          "account.connectedCharacters.avatarImport.success",
          `Avatar saved for ${selectedPlayer.name || selectedPlayer.identifier} (${selectedPlayer.server}).`,
        ),
      );
    } catch (error: any) {
      if (error?.message === AVATAR_IMPORT_NO_OWN_PLAYER_ERROR) {
        setAvatarImportError(buildAvatarImportNoOwnPlayerMessage(t));
        return;
      }
      const message =
        error?.message || t("account.connectedCharacters.avatarImport.errors.generic", "Avatar import failed.");
      setAvatarImportError(message);
    } finally {
      setIsAvatarImporting(false);
    }
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
        "account.connectedCharacters.help.wip.steps.progress",
        "Work in progress: character linking is still under development.",
      ),
      t(
        "account.connectedCharacters.help.wip.steps.avatarImport",
        "For now, you can import your profile avatar from an SFTools JSON export below.",
      ),
      t(
        "account.connectedCharacters.help.wip.steps.publicExportWarning",
        'Important: do NOT enable "Export only public data ..." in SFTools, otherwise your own character will not be marked as "own": 1 and avatar data will be missing.',
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
          <span>
            {t(
              "account.connectedCharacters.help.wip.title",
              "Connected characters (Work in progress)",
            )}
          </span>
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
                "account.connectedCharacters.help.wip.quickCheck",
                'Quick check: search the JSON for "own": 1.',
              )}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderAvatarImport = () => {
    const showSelection = avatarImportCandidates.length > 1;

    return (
      <div className={styles.avatarImportBox}>
        <div className={styles.avatarImportHeader}>
          <div>
            <h3 className={styles.avatarImportTitle}>
              {t("account.connectedCharacters.avatarImport.title", "Import avatar from SF JSON")}
            </h3>
            <p className={styles.avatarImportSubtitle}>
              {t(
                "account.connectedCharacters.avatarImport.subtitle",
                "Paste or upload a JSON export and we store the portrait for your profile avatar.",
              )}
            </p>
          </div>
          <label className={styles.avatarImportFileButton}>
            <input
              type="file"
              accept=".json,application/json"
              className={styles.avatarImportFileInput}
              onChange={handleAvatarJsonFileChange}
              disabled={isAvatarImporting}
            />
            {t("account.connectedCharacters.avatarImport.actions.chooseFile", "Choose JSON")}
          </label>
        </div>

        <textarea
          className={styles.avatarImportTextarea}
          value={avatarImportJson}
          onChange={(event) => {
            setAvatarImportJson(event.target.value);
            setAvatarImportCandidates([]);
            setSelectedImportIdentifier("");
            setAvatarImportError(null);
            setAvatarImportStatus(null);
          }}
          placeholder={t(
            "account.connectedCharacters.avatarImport.placeholder",
            'Paste the full JSON here (must include "players" and an entry with "own": 1).',
          )}
          rows={8}
          disabled={isAvatarImporting}
        />

        {showSelection && (
          <div className={styles.avatarImportSelectionRow}>
            <label htmlFor="avatar-import-character" className={styles.avatarImportLabel}>
              {t("account.connectedCharacters.avatarImport.selectionLabel", "Character")}
            </label>
            <select
              id="avatar-import-character"
              className={styles.avatarImportSelect}
              value={selectedImportIdentifier}
              onChange={(event) => setSelectedImportIdentifier(event.target.value)}
              disabled={isAvatarImporting}
            >
              {avatarImportCandidates.map((player) => (
                <option key={player.identifier} value={player.identifier}>
                  {`${player.name || player.identifier} (${player.server})`}
                </option>
              ))}
            </select>
          </div>
        )}

        {!!avatarImportStatus && <p className={styles.avatarImportSuccess}>{avatarImportStatus}</p>}
        {!!avatarImportError && <p className={styles.avatarImportError}>{avatarImportError}</p>}

        <div className={styles.avatarImportActions}>
          <button
            type="button"
            className={accountStyles.secondaryButton}
            onClick={handleImportAvatarFromJson}
            disabled={isAvatarImporting}
          >
            {isAvatarImporting
              ? t("account.connectedCharacters.avatarImport.actions.importing", "Importing...")
              : t("account.connectedCharacters.avatarImport.actions.import", "Import avatar")}
          </button>
        </div>
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
      {renderAvatarImport()}

      {!isRefreshing && linkedPlayers.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>
            {t("account.connectedCharacters.empty.title", "No characters linked yet")}
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
