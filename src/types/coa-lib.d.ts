declare module "https://sf-libs.12hp.de/coa-lib/*" {
  export class CoaRenderer {
    static VERSION: string;
    currentCOAString: string;
    currentGuildName: string;
    decodedCOAIndexes: {
      helm: number;
      supporter: number;
      shield: number;
      banner: number;
      helmet: number;
      order: number;
      emblem: number;
      shieldColor1: number;
      shieldColor2: number;
      emblemColor: number;
    };
    onFinish: () => void;
    onError: (error: Error) => void;

    constructor(canvasElement: HTMLCanvasElement, coaString: string, guildName?: string);
    updateCOA(coaString: string, guildName?: string): Promise<void>;
    dispose(): void;
  }

  export const VERSION: string;
}
