import {Group, Text, UnstyledButton} from "@mantine/core";
import styles from "@/components/button/ElvButton.module.css";

// TODO: Replace with mantine button when app is re-styled
const ElvButton = ({
  variant,
  leftSection,
  children,
  ...rest
}) => {
  return (
    <UnstyledButton
      p="0 12px"
      className={variant === "outline" ? styles.outline : styles.filled}
      {...rest}
    >
      <Group justify="center" gap={4}>
        {
          leftSection ? leftSection : null
        }
        <Text fz="sm" pr={leftSection ? "4px" : 0}>
          { children }
        </Text>
      </Group>
    </UnstyledButton>
  );
};

export default ElvButton;
