declare const __APP_VERSION__: string | undefined;

/** Version de l'application (injectée au build par Vite), utilisée par la télémétrie. */
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
