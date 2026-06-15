import {Flex, Pill, Scroller, Text, UnstyledButton} from "@mantine/core";
import styles from "./TagFilterRow.module.css";
import {IconChevronLeft, IconChevronRight} from "@tabler/icons-react";

const TagFilterRow = ({tags=[], selectedTags=[], onTagToggle, onClearAll}) => {
  if(!tags.length) { return null; }

  return (
    <Flex direction="row" align="center" mb={20}>
      <UnstyledButton onClick={onClearAll} mr={14} disabled={selectedTags.length === 0}>
        <Text tt="uppercase" c={selectedTags.length === 0 ? "elv-gray.6" : "elv-blue.3"} fw={700} fz="0.875rem" textWrap="nowrap">Clear All</Text>
      </UnstyledButton>
      <Scroller
        startControlIcon={<IconChevronLeft size={24} color="var(--mantine-color-elv-gray-6)" />}
        endControlIcon={<IconChevronRight size={24} color="var(--mantine-color-elv-gray-6)" />}
      >
        <Flex
          gap={8}
        >
          {tags.map(tag => {
            const selected = selectedTags.includes(tag);
            return (
              <Pill
                key={tag}
                size="md"
                classNames={{
                  root: selected ? styles.pillSelected : styles.pill,
                  label: styles.pillLabel,
                  remove: styles.pillRemove
                }}
                onClick={() => onTagToggle(tag)}
                withRemoveButton={selected}
                onRemove={() => onTagToggle(tag)}
              >
                {tag}
              </Pill>
            );
          })}
        </Flex>
      </Scroller>
    </Flex>
  );
};

export default TagFilterRow;
