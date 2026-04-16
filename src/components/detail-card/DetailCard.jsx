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
          { titleRightSection ?? null }
        </Flex>
      </Group>
      <Divider c="elv-gray.2" mt={8} mb={8} />
    </>
  );
};

// Renders rows as direct children of whatever grid contains it
export const DetailCardBody = ({data=[], id}) => {
  return (
    <>
      {
        data.map((item, i) => (
          <Fragment key={`row-${id}-${i}`}>
            <Text c="elv-gray.7" fw={400} fz="0.875rem" className={styles.noWrapText}>{ item.label }:</Text>
            <ValueSection value={item.value} fw={item.fw} copyable={item.copyable} lineClamp={item.lineClamp} />
          </Fragment>
        ))
      }
    </>
  );
};

// Spans both columns and uses subgrid so its rows share the parent card's column tracks
export const SubDetailCard = ({title, titleRightSection, data=[]}) => {
  return (
    <div className={styles.subCard}>
      <div className={styles.fullWidth}>
        <DetailCardHeader title={title} titleRightSection={titleRightSection} />
      </div>
      <DetailCardBody id={title} data={data} />
    </div>
  );
};

const DetailCard = ({
  title,
  titleRightSection,
  data,
  children,
  width,
  labelWidth,
  ...props
}) => {
  return (
    <Box w={width} bd="1px solid elv-gray.2" radius={5} className={styles.boxWrapper} {...props}>
      <Box p={12}>
        <div
          className={styles.cardGrid}
          style={labelWidth ? {gridTemplateColumns: `${typeof labelWidth === "number" ? `${labelWidth}px` : labelWidth} 1fr`} : undefined}
        >
          <div className={styles.fullWidth}>
            <DetailCardHeader title={title} titleRightSection={titleRightSection} />
          </div>
          {data && <DetailCardBody id={title} data={data} />}
          {children}
        </div>
      </Box>
    </Box>
  );
};

export default DetailCard;