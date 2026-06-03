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
