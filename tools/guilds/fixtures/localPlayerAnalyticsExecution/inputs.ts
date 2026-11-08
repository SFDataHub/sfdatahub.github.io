import { inputs, anchor } from "../localPlayerAnalyticsCoordinator/inputs";
export { anchor };
export function executionInputs(size: 2 | 50) {
    return inputs.slice(0, 6).map(input => ({ ...input, id: `baseline-${size}-${input.id}`, rawData: {
            players: input.rawData.players.flatMap(row => Array.from({ length: size / 2 }, (_, i) => ({ ...row, identifier: row.identifier.replace(/_p(\d+)$/, (_, n) => `_p${Number(n) + i * 10}`), name: i ? `Peer ${i}` : row.name }))),
            groups: input.rawData.groups.map(row => ({ ...row, memberCount: size })),
        } }));
}
