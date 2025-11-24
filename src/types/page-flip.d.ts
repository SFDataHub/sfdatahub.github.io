declare module "page-flip" {
  export type SizeType = "fixed" | "stretch" | "portrait" | "landscape";

  export class PageFlip {
    constructor(host: HTMLElement, options?: Record<string, unknown>);
    loadFromImages(images: string[]): void;
    update(): void;
    destroy(): void;
    turnToPage(page: number, corner?: string): void;
    flipPrev(corner?: string): void;
    flipNext(corner?: string): void;
    on(event: string, handler: (...args: any[]) => void): void;
  }
}
