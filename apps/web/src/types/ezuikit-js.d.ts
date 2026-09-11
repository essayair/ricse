// ezuikit-js 未随包提供类型声明，这里只声明本项目实际用到的构造参数与方法。
declare module 'ezuikit-js' {
  interface EZUIKitPlayerOptions {
    id: string;
    accessToken: string;
    url: string;
    width?: number;
    height?: number;
    template?: string;
    scaleMode?: number;
    quality?: number;
    audio?: boolean;
  }

  export class EZUIKitPlayer {
    constructor(options: EZUIKitPlayerOptions);
    destroy(): void;
    changePlayUrl(options: { url: string }): void;
  }

  export default EZUIKitPlayer;
}
