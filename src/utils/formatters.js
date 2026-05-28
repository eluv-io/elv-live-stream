import Fraction from "fraction.js";

export const VideoBitrateReadable = (bitrate) => {
  if(!bitrate) { return ""; }
  let value = (bitrate / 1000000).toFixed(1);

  return `${value}Mbps`;
};

export const AudioBitrateReadable = (bitrate) => {
  if(!bitrate) { return ""; }
  const denominator = 1000;
  const value = (bitrate / denominator).toFixed(0);

  return `${value} Kbps`;
};

export const SampleRateReadable = (sampleRate) => {
  if(!sampleRate) { return ""; }
  return `${(sampleRate / 1000).toFixed(0)} kHz`;
};

export const FormatTime = ({milliseconds, iso, format="hh,mm,ss"}) => {
  if(iso) {
    milliseconds = new Date(iso).getTime();
  }

  if(!milliseconds) { return ""; }

  const hours = new Fraction(milliseconds, 1000)
    .div(3600)
    .floor(0)
    .toString();
  const minutes = new Fraction(milliseconds, 1000)
    .div(60)
    .mod(60)
    .floor(0)
    .toString();
  const seconds = new Fraction(milliseconds, 1000)
    .mod(60)
    .floor(0)
    .toString();

  let timeString = `${hours}h ${minutes}min`;

  if(format === "hh:mm:ss") {
    const arrayValue = [
      hours.padStart(2, "0"),
      minutes.padStart(2, "0"),
      seconds.padStart(2, "0")
    ];

    timeString = arrayValue.join(":");
  } else if(format === "hh,mm") {
    timeString = `${hours}h ${minutes}min`;
  } else if(format === "hh,mm,ss") {
    timeString = `${hours}h ${minutes}min ${seconds}sec`;
  }

  return timeString;
};

export const Pluralize = ({base, suffix="s", count}) => {
  return `${count} ${base}${count > 1 ? suffix : ""}`;
};

export const DateFormat = ({time, format="sec", options={month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true}}) => {
  if(!["sec", "iso", "ms"].includes(format)) { throw Error("Invalid format type provided."); }

  if(format === "sec") {
    time = time * 1000;
  }

  if(format === "iso") {
    time = Date.parse(time);
  }

  return new Date(time).toLocaleString(navigator.language, options);
};

export const BytesToMb = (bytes) => {
  if(!bytes) { return "0 MB"; }
  return `${(bytes / 1_000_000).toLocaleString(navigator.language, {maximumFractionDigits: 2})} MB`;
};

const rtf = new Intl.RelativeTimeFormat("en", {numeric: "auto"});

export const RelativeTime = (date) => {
  if(!date) { return ""; }

  const diff = Math.floor((new Date(date).getTime() - Date.now()) / 1000);
  if(Math.abs(diff) < 60) { return rtf.format(diff, "second"); }
  const minutes = Math.floor(diff / 60);
  if(Math.abs(minutes) < 60) { return rtf.format(minutes, "minute"); }
  const hours = Math.floor(minutes / 60);
  if(Math.abs(hours) < 24) { return rtf.format(hours, "hour"); }
  return rtf.format(Math.floor(hours / 24), "day");
};
