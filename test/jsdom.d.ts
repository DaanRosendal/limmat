// jsdom ships no types, and the server tests only need to create a window.
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string);
    window: any;
  }
}
