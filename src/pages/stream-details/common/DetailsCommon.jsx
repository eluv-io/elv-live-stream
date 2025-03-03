import {Title} from "@mantine/core";
import styles from "./DetailsCommon.module.css";

export const DetailsSectionTitle = ({mb=0, children}) => {
  return (
    <Title order={2} c="elv-blue.3" mb={mb} className={styles.detailsSectionTitle}>
      { children }
    </Title>
  );
};

export const BasicTableRowText = ({children}) => {
  return (
    <Title order={4} c="elv-gray.9" className={styles.tableRowText}>
      { children }
    </Title>
  );
};
