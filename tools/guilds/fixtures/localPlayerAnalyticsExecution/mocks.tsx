import React from "react";
export const None = () => null;
export const Portrait = () => <span>Portrait</span>;
export const useGuildEmblemVisual = () => ({ visualEmblemUrl: null, accent: "#ccc", ready: true });
export const Shell = ({ children }: {
    children?: React.ReactNode;
}) => <div>{children}</div>;
const selection = { activeGuild: { id: "f28_net_g1", guildId: "g1", name: "Fixture Guild", server: "f28_net", logoIdentifier: "f28_net_g1", logo: "f28_net_g1", memberCount: 2, hofRank: 5, coaString: null }, activeGuildId: "f28_net_g1", isLoading: false };
export const useGuildHubSelection = () => selection;
export const acquireDashboardLocalFirstFeatureScans = async () => ({ status: "cancelled" });

export const prepareGuildCoa = async () => null;

export const useRenderedCoaUrl = () => ({ url: null, ready: true });
