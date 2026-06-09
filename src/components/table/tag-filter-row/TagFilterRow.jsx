import {Flex, Pill, Scroller} from "@mantine/core";
import styles from "./TagFilterRow.module.css";
import {IconChevronLeft, IconChevronRight} from "@tabler/icons-react";

const TagFilterRow = ({tags=[], selectedTags=[], onTagToggle}) => {
  if(!tags.length) { return null; }

  return (
    <Scroller
      mb={20}
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
  );
};

export default TagFilterRow;
