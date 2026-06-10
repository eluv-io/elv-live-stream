import { MantineColorsTuple } from "@mantine/core";

type ElvColors =
  | "elv-blue"
  | "elv-blue-gray"
  | "elv-violet"
  | "elv-gray"
  | "elv-black"
  | "elv-neutral"
  | "elv-orange"
  | "elv-red"
  | "elv-yellow"
  | "elv-green";

declare module "@mantine/core" {
  export interface MantineThemeColorsOverride {
    colors: Record<ElvColors, MantineColorsTuple>;
  }
}