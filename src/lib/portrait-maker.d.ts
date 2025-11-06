// FILE: src/types/portrait-maker.d.ts
declare module "https://pm-lib.12hp.de/PortraitMaker-core-1.30.js" {
  export default class PortraitMaker {
    constructor(canvas: HTMLCanvasElement, options: any);
    currentPortraitOptions: any;
    onFinish?: () => void;
    dispose?: () => void;
  }
}
