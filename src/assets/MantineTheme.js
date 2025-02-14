import {createTheme} from "@mantine/core";

const theme = createTheme({
  fontFamily: "Helvetica Neue, Helvetica, sans-serif",
  // fontFamily: "-apple-system, system-ui, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
  // fontFamily: "Inter, Montserrat, Helvetica Neue, Helvetica, sans-serif",
  // fontFamilyMonospace: "Monaco, Courier, monospace",
  headings: {
    fontFamily: "Helvetica Neue, Helvetica, sans-serif"
  },
  // TODO: Change primary color
  // primaryColor: "elv-violet",
  // primaryShade: 3,
  colors: {
    "elv-violet": [
      "#f9e9ff",
      "#ebcfff",
      "#d29cff",
      "#b964ff", // eluvio color
      "#a437fe",
      "#971afe",
      "#9009ff",
      "#7c00e4",
      "#8f5aff", // eluvio color
      "#5f00b3",
      "#380C61", // eluvio color
    ],
    "elv-gray": [
      "#f5f5f5",
      "#eee",
      "#cdcdcd",
      "#b2b2b2",
      "#9a9a9a",
      "#8b8b8b",
      "#848484",
      "#717171",
      "#656565",
      "#3C3C3C" // eluvio color
    ],
    "elv-neutral": [
      "#f8f2fe",
      "#e8e4ed",
      "#cdc8d3",
      "#b2aaba", // eluvio color
      "#a9a0b2", // eluvio color
      "#8b7f97",
      "#847791",
      "#71667e",
      "#665972",
      "#594c66"
    ],
    "elv-orange": [
      "#fff6e1",
      "#ffeccc",
      "#ffd79b",
      "#ffc164",
      "#ffae38",
      "#ffa31b",
      "#f90", // eluvio color
      "#e38800",
      "#ca7800",
      "#b06700"
    ],
    "elv-red": [
      "#ffe9e6",
      "#ffd3cd",
      "#ffa69b",
      "#ff7663",
      "#ff4723", // eluvio color
      "#ff3418",
      "#ff2507",
      "#e41600",
      "#cc0e00",
      "#b20000"
    ],
    "elv-yellow": [
      "#fffde2",
      "#fffacc",
      "#fff59b",
      "#ffef64",
      "#ffeb39",
      "#ffe81d",
      "#ffe607", // eluvio color
      "#e3cc00",
      "#c9b500",
      "#ad9c00"
    ],
    "elv-green": [
      "#e4fdf4",
      "#d6f6e8",
      "#b0e8d1",
      "#88dab8",
      "#66cfa3",
      "#57ca9a", // eluvio color
      "#41c48f",
      "#30ad7a",
      "#249a6b",
      "#0b865a"
    ]
  },
  // Default styles for components that need styles across components
  components: {
    Tabs: {
      styles: () => ({
        // list: {
        //   "--tab-border-color": "var(--mantine-color-elv-neutral-4)",
        //   "--tabs-list-border-size": "1px"
        // }
      })
    },
    Anchor: {
      styles: () => ({
        root: {
          "textDecoration": "underline",
          "fontWeight": "700",
          "fontSize": "0.75rem"
        }
      })
    },
    Radio: {
      styles: () => ({
        root: {
          "--radio-icon-size": "0.5rem"
        }
      })
    },
    Group: {
      styles: () => ({
        root: {
          "--mantine-spacing-xxs": "0.3125rem"
        }
      })
    },
    Button: {
      styles: () => ({
        // root: {
        //   "border": "2px solid var(--mantine-color-elv-violet-outline)"
        // }
      })
    },
    Modal: {
      styles: () => ({
        title: {
          "fontSize": "1.25rem"
        }
      })
    },
    Indicator: {
      styles: () => ({
        root: {
          "lgg": "16px"
        }
      })
    }
  }
});

export default theme;
