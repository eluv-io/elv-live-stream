module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  settings: { react: { version: "detect" } },
  plugins: ["react-refresh", "spellcheck"],
  rules: {
    "react-hooks/exhaustive-deps": 0,
    "react/prop-types": 0,
    "semi": ["error", "always", { "omitLastInOneLineClassBody": true }],
    "react-refresh/only-export-components": [
      'warn',
      { allowConstantExport: true },
    ],
    "no-console": [
      "error"
    ],
    "quotes": [
      "error",
      "double"
    ],
    "spellcheck/spell-checker": [1,
      {
        "lang": "en_US",
        "skipWords": [
          "24zm40",
          "8zm",
          "aac",
          "accessor",
          "aes",
          "algo",
          "audioaudio",
          "arial",
          "autoplay",
          "avc1",
          "bitrate",
          "blockchain",
          "breakpoint",
          "calc",
          "cenc",
          "checkbox",
          "cloneable",
          "cls",
          "codec",
          "codecs",
          "copyable",
          "debounced",
          "drm",
          "drms",
          "dvr",
          "eluvio",
          "elv",
          "evenodd",
          "fairplay",
          "falsey",
          "flexbox",
          "helvetica",
          "hls",
          "ilib",
          "iq",
          "iten",
          "Kbps",
          "lang",
          "lgg",
          "lh",
          "lro",
          "mantine",
          "mb",
          "mbps",
          "monospace",
          "moz",
          "mpeg2video",
          "mpegts",
          "nb",
          "neue",
          "noreferrer",
          "nowrap",
          "passphrase",
          "pathname",
          "playout",
          "playready",
          "popups",
          "qfab",
          "reconnection",
          "roboto",
          "rtmp",
          "sandboxed",
          "segoe",
          "slugify",
          "srt",
          "stringified",
          "subtree",
          "textarea",
          "tooltip",
          "ttl",
          "tw",
          "udp",
          "unconfigured",
          "undef",
          "unmounting",
          "unstyled",
          "urls",
          "videovideo",
          "vo",
          "vod",
          "webkit",
          "widevine",
          "wm",
          "xc",
          "xl",
          "xxs"
        ]
      }]
  },
}
