interface ValidateTextFieldProps {
  value?: string;
  key?: string;
}

export const ValidateTextField = ({value, key}: ValidateTextFieldProps={}): string | null => {
  const name = key ?? "Value";

  if(!value) { return `${name} is required`; }

  const trimmedValue = value.trim();

  if(value && trimmedValue.length < 3) {
    return `${name} must be at least 3 characters long`;
  }

  return null;
};

export const ValidateUrl = ({value}: {value?: string} = {}): string | null => {
  const trimmed = value?.trim();

  if(!trimmed) { return null; }

  try {
    const {protocol, hostname} = new URL(trimmed);

    if(!["http:", "https:"].includes(protocol) || !hostname) {
      return "Enter a valid URL starting with http:// or https://";
    }
  } catch {
    return "Enter a valid URL starting with http:// or https://";
  }

  return null;
};
