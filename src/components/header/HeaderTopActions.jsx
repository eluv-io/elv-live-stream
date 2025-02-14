import {Flex} from "@mantine/core";

// TODO: Update all buttons to Mantine button
const HeaderTopActions = ({actions=[]}) => {
  return (
    <Flex direction="row" gap="sm">
      {
        actions.map(({label, variant = "filled", onClick, disabled}) => (
          <button
            type="button"
            className={variant === "filled" ? "button__primary" : "button__secondary"}
            onClick={onClick}
            key={`top-action-${label}`}
            disabled={disabled}
          >
            {label}
          </button>
        ))
      }
    </Flex>
  );
};

export default HeaderTopActions;
