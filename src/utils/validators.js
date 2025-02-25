export const ValidateTextField = ({value, key}) => {
  const trimmedValue = value.trim();

  if(value && trimmedValue.length < 3) {
    return `${key} must be at least 3 characters long`;
  }

  return null;
};
