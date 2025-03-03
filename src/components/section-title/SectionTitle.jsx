import {Title} from "@mantine/core";
import styles from "./SectionTitle.module.css";

const SectionTitle = ({mb=0, children}) => {
  return (
    <Title order={2} c="elv-blue.3" mb={mb} className={styles.title}>
      { children }
    </Title>
  );
};

export default SectionTitle;
