import {Title} from "@mantine/core";
import styles from "./DetailsCommon.module.css";

export const BasicTableRowText = ({children, ...props}) => {
  return (
    <Title order={4} c="elv-gray.9" className={styles.tableRowText} {...props}>
      { children }
    </Title>
  );
};
