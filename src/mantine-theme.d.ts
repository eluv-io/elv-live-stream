import { MantineColorsTuple } from "@mantine/core";

type ElvColorsBase =
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

type ElvColors = ElvColorsBase | `${ElvColorsBase}.${0|1|2|3|4|5|6|7|8|9}`;

declare module "@mantine/core" {
  export interface MantineThemeColorsOverride {
    colors: Record<ElvColors, MantineColorsTuple>;
  }
}