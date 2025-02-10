import {createTheme} from "@mantine/core";

const theme = createTheme({
  fontFamily: "Helvetica Neue, Helvetica, sans-serif",
  // fontFamily: "-apple-system, system-ui, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
  // fontFamily: "Inter, Montserrat, Helvetica Neue, Helvetica, sans-serif",
  // fontFamilyMonospace: "Monaco, Courier, monospace",
  headings: {
    fontFamily: "Helvetica Neue, Helvetica, sans-serif"
  },
  primaryColor: "elv-violet",
  primaryShade: 3,
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
      "#380c61", // eluvio color
    ],
    "elv-gray": [
      "#f5f5f5",
      "#f0f0f0",
      "#d7d7d7", // eluvio color
      "#bdbdbd", // eluvio color
      "rgba(0,0,0,0.06)", // eluvio color
      "#8b8b8b",
      "#848484",
      "#717171",
      "#4b494e", // eluvio color
      "#3c3c3c" // eluvio color
    ],
    "elv-neutral": [
      "#f8f2fe",
      "#ecece8", // eluvio color
      "#cdc8d3",
      "#b2aaba", // eluvio color
      "#a9a0b2", // eluvio color
      "#7b7580", // eluvio color
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
