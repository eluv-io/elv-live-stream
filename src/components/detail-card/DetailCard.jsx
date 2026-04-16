import {ActionIcon, Box, Divider, Flex, Group, Text, Tooltip} from "@mantine/core";
import {Fragment} from "react";
import styles from "./DetailCard.module.css";
import {IconCopy} from "@tabler/icons-react";
import {useClipboard} from "@mantine/hooks";

const ValueSection = ({
  value,
  fw=600,
  copyable=false,
  lineClamp
}) => {
  const clipboard = useClipboard(({timeout: 500}));
  if(!value && value !== 0) { return <Text fz="0.875rem"></Text>; }

  if(typeof value === "string" || typeof value === "number") {
    return (
      <Flex gap={4} align="center" miw={0}>
        <Text c="elv-gray.7" fw={fw} fz="0.875rem" truncate={lineClamp ? "end" : ""} flex={1} miw={0}>{ value }</Text>
        {
          copyable ?
            <Tooltip
              label={clipboard.copied ? "Copied" : "Copy"}
              position="bottom"
            >
              <ActionIcon
                variant="transparent"
                c="elv-gray.6"
                size={18}
                onClick={() => clipboard.copy(value)}
              >
                <IconCopy size={16} />
              </ActionIcon>
            </Tooltip> : null
        }
      </Flex>
    );
  } else {
    return value;
  }
};

export const DetailCardHeader = ({title, titleRightSection}) => {
  return (
    <>
      <Group>
        <Text fw={600} fz="0.875rem" c="elv-gray.7">{ title }</Text>
        <Flex ml="auto">
          {
            titleRightSection ? titleRightSection : null
          }
        </Flex>
      </Group>
      <Divider c="elv-gray.2" mt={8} mb={8} />
    </>
  );
};

export const DetailCardBody = ({data=[], id}) => {
  return (
    <Box className={styles.grid}>
      {
        data.map((item, i) => (
          <Fragment key={`row-${id}-${i}`}>
            <Text c="elv-gray.7" fw={400} fz="0.875rem" className={styles.noWrapText}>{ item.label }:</Text>
            <ValueSection value={item.value} fw={item.fw} copyable={item.copyable} lineClamp={item.lineClamp} />
          </Fragment>
        ))
      }
    </Box>
  );
};

export const SubDetailCard = ({title, titleRightSection, data=[]}) => {
  return (
    <Box bg="elv-gray.0" className={styles.subCard} p={12} mt={8}>
      <DetailCardHeader title={title} titleRightSection={titleRightSection} />
      <DetailCardBody id={title} data={data} />
    </Box>
  );
};

const DetailCard = ({
  title,
  titleRightSection,
  data,
  children,
  width,
  ...props
}) => {
  return (
    <Box w={width} bd="1px solid elv-gray.2" radius={5} className={styles.boxWrapper} {...props}>
      <Box p={12}>
        <DetailCardHeader title={title} titleRightSection={titleRightSection} />
        {data && <DetailCardBody id={title} data={data} />}
        {children}
      </Box>
    </Box>
  );
};

export default DetailCard;
