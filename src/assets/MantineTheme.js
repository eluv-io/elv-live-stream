import {createTheme, rem} from "@mantine/core";

const theme = createTheme({
  fontFamily: "Inter, Helvetica Neue, helvetica, sans-serif",
  headings: {
    fontFamily: "Inter, Helvetica Neue, helvetica, sans-serif",
    sizes: {
      h1: {
        fontSize: rem(22),
        fontWeight: 600
      },
      h2: {
        fontSize: rem(18),
        fontWeight: 600,
      },
      h3: {
        fontSize: rem(14),
        fontWeight: 700
      },
      h4: {
        fontSize: rem(14),
        fontWeight: 500
      },
      h6: {
        fontSize: rem(12),
        fontWeight: 500
      }
    }
  },
  primaryColor: "elv-blue",
  primaryShade: 5,
  colors: {
    "elv-blue": [
      "#ebf3fc", // eluvio color
      "#f8f9fd", // eluvio color
      "#228be6", // eluvio color
      "#4489df", // eluvio color
      "#3f85e3", // eluvio color
      "#336be4", // eluvio color
      "#1a71cf", // eluvio color
      "#1351cb",
      "#0648b6",
      "#003ea2"
    ],
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
      "#e3e3e3", // eluvio color
      "#d7d7d7", // eluvio color
      "#bdbdbd", // eluvio color
      "rgba(0,0,0,0.06)", // eluvio color
      "#8b8b8b",
      "#868e96", // eluvio color
      "#6b6b6b", // eluvio color
      "#4b494e", // eluvio color
      "#3c3c3c" // eluvio color
    ],
    "elv-black": [
      "#22252a", // eluvio color
      "#202020", // eluvio color
      "#1e1e1e" // eluvio color
    ],
    "elv-neutral": [
      "#eeeeee", // eluvio color
      "#ecece8", // eluvio color
      "#c2c6d7", // eluvio color
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
          "fontSize": rem(12)
        }
      })
    },
    AppShell: {
      styles: () => ({
        root: {
          "--app-shell-border-color": "var(--mantine-color-elv-neutral-0)"
        }
      })
    },
    Button: {
      defaultProps: {
        variant: "filled"
      },
      styles: (theme, params) => ({
        root: {
          "minWidth": "7rem",
          "--button-radius": rem(5),
          "--mantine-color-elv-blue-outline": "var(--mantine-color-elv-blue-3)",
          "--mantine-color-elv-blue-filled": "var(--mantine-color-elv-blue-3)",
          // Change outline default design
          ...(params.variant === "outline" && {
            "borderWidth": "2px",
            ...(params.disabled && {
              "border": "2px solid var(--mantine-color-elv-gray-6)",
              "opacity": "50%",
              "backgroundColor": "transparent"
            })
          })
        }
      })
    },
    Checkbox: {
      styles: () => ({
        input: {
          "--checkbox-color": "var(--mantine-color-elv-blue-3)",
          "borderRadius": "2.2px"
        }
      })
    },
    InputWrapper: {
      styles: () => ({
        label: {
          "fontWeight": 700,
          "fontSize": rem(14),
          "color": "var(--mantine-color-elv-gray-9)",
          "marginBottom": "2px"
        }
      })
    },
    Modal: {
      styles: () => ({
        title: {
          "fontSize": rem(20)
        }
      })
    },
    NavLink: {
      styles: (theme, params) => ({
        root: {
          ...(params.active && {
            "backgroundColor": "var(--mantine-color-elv-blue-1)"
          })
        },
        label: {
          ...(params.active && {
            "color": "var(--mantine-color-elv-blue-3)"
          })
        }
      })
    },
    Radio: {
      styles: () => ({
        root: {
          "--radio-icon-size": rem(8),
        },
        input: {
          "&:checked": {
            "border": "2px solid black"
          }
        },
        radio: {
          "--radio-color": "var(--mantine-color-elv-blue-3)"
        },
        label: {
          "fontWeight": 700,
          "fontSize": rem(14),
          "color": "var(--mantine-color-elv-gray-9)"
        },
        description: {
          "fontWeight": 500,
          "fontSize": rem(12),
          "color": "var(--mantine-color-elv-gray-6)"
        }
      })
    },
    Select: {
      styles: () => ({
        input: {
          "borderRadius": rem(6)
        }
      })
    },
    TextInput: {
      styles: () => ({
        input: {
          "borderRadius": rem(6)
        }
      })
    }
  }
});

export default theme;
