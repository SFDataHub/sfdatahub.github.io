import assert from "node:assert/strict";

type PostedMessage = {
  requestId: number;
  type: string;
  datasetId?: string;
};

class MockWorker {
  static messages: PostedMessage[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: PostedMessage) {
    MockWorker.messages.push(message);
    queueMicrotask(() => {
      if (message.type === "search") {
        this.onmessage?.({
          data: {
            requestId: message.requestId,
            ok: true,
            type: "search",
            datasetId: message.datasetId,
            normalizedQuery: "ather",
            results: [],
          },
        } as MessageEvent);
        return;
      }
      this.onmessage?.({
        data: {
          requestId: message.requestId,
          ok: true,
          type: message.type,
          tab: "guilds",
          totalRows: 0,
          page: 1,
          pageSize: 0,
          playerRows: [],
          guildRows: [],
        },
      } as MessageEvent);
    });
  }

  terminate() {
    // Test double.
  }
}

globalThis.Worker = MockWorker as unknown as typeof Worker;

const { LocalToplistViewWorkerSession } = await import("../../src/lib/toplists/localToplistViewWorkerClient.ts");

const initMessages = () => MockWorker.messages.filter((message) => message.type === "init");

const session = new LocalToplistViewWorkerSession();
await session.setData("derivation:2|scan-a:aaaaaaaa", [], []);
await session.setData("derivation:2|scan-a:aaaaaaaa", [], []);
assert.equal(initMessages().length, 1);
assert.equal(initMessages()[0]?.datasetId, "derivation:2|scan-a:aaaaaaaa");

await session.setData("derivation:3|scan-a:aaaaaaaa", [], []);
assert.equal(initMessages().length, 2);
assert.equal(initMessages()[1]?.datasetId, "derivation:3|scan-a:aaaaaaaa");

await session.requestView({
  datasetId: "derivation:3|scan-a:aaaaaaaa",
  tab: "guilds",
  filters: { servers: [], playerClasses: [] },
  sort: { metricKey: "guildAvgLevel", direction: "desc" },
  guildAverageMode: "base",
  page: 1,
  pageSize: 50,
});
assert.equal(MockWorker.messages.filter((message) => message.type === "view").length, 1);

await session.requestSearch({
  datasetId: "derivation:3|scan-a:aaaaaaaa",
  query: "ather",
  jumpableGuildIdentifiers: ["eu1__10"],
});
const searchMessages = MockWorker.messages.filter((message) => message.type === "search");
assert.equal(searchMessages.length, 1);
assert.equal(initMessages().length, 2);
assert.equal("playerRows" in searchMessages[0]!, false);
assert.equal("guildRows" in searchMessages[0]!, false);
assert.equal("jumpablePlayerIdentifiers" in searchMessages[0]!, false);

session.dispose();
console.log("localToplistViewWorkerClient.test: ok");
