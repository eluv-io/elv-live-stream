declare module "@eluvio/elv-client-js/src/FrameClient" {
  export class FrameClient {
    constructor(options: {target: Window; timeout: number});
    [key: string]: any;
  }
}

declare module "@eluvio/elv-client-js/utilities/lib/helpers.js" {
  export function slugify(str: string): string;

  const helpers: { [key: string]: any };
  export default helpers;
}
