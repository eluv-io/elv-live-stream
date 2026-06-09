import {useCallback, useState} from "react";
import {Button, CheckIcon, Combobox, Flex, Group, ScrollArea, TextInput, useCombobox} from "@mantine/core";
import {IconSearch} from "@tabler/icons-react";
import styles from "./Actions.module.css";

const Actions = ({
  actions,
  mb=20,
  searchValue,
  onSearchChange,
  tagOptions=[],
  tagFilter=[],
  onTagFilterChange
}) => {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const [dropdownWidth, setDropdownWidth] = useState(undefined);

  const measureInput = useCallback(node => {
    if(node) { setDropdownWidth(Math.round(node.offsetWidth * 1.35)); }
  }, []);

  const filteredTags = tagOptions.filter(tag =>
    tag.toLowerCase().includes((searchValue || "").toLowerCase())
  );

  const toggleTag = (tag) => {
    onTagFilterChange(
      tagFilter.includes(tag) ? tagFilter.filter(t => t !== tag) : [...tagFilter, tag]
    );
  };

  return (
    <>
      <Flex w="100%" align="start" mb={mb}>
        <Combobox
          store={combobox}
          onOptionSubmit={toggleTag}
          classNames={{dropdown: styles.comboboxDropdown, option: styles.comboboxOption}}
          width={dropdownWidth}
          position="bottom-start"
          flex={2}
          maw={400}
        >
          <Combobox.Target>
            <TextInput
              ref={measureInput}
              classNames={{input: styles.searchBar}}
              placeholder="Search by name, ID, or tags"
              leftSection={<IconSearch width={15} height={15} />}
              value={searchValue}
              onChange={(e) => {
                onSearchChange(e);
                if(tagOptions.length > 0) { combobox.openDropdown(); }
              }}
              onFocus={() => { if(tagOptions.length > 0) { combobox.openDropdown(); } }}
              onBlur={() => combobox.closeDropdown()}
            />
          </Combobox.Target>
          {filteredTags.length > 0 && (
            <Combobox.Dropdown>
              <ScrollArea.Autosize mah={300} type="scroll">
                <Combobox.Options>
                  {filteredTags.map(tag => (
                    <Combobox.Option key={tag} value={tag} active={tagFilter.includes(tag)}>
                      <Group gap="sm">
                        {tagFilter.includes(tag) && (
                          <span className={styles.comboboxCheck}>
                            <CheckIcon size={12} />
                          </span>
                        )}
                        {tag}
                      </Group>
                    </Combobox.Option>
                  ))}
                </Combobox.Options>
              </ScrollArea.Autosize>
            </Combobox.Dropdown>
          )}
        </Combobox>
        <Group ml="auto" gap={8}>
          {actions.map(action => (
            <Button
              key={action.id}
              variant={action.variant}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </Group>
      </Flex>
    </>
  );
};

export default Actions;
