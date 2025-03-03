import {ActionIcon, Box, Button, Flex, Group, TextInput, Title} from "@mantine/core";
import {useState} from "react";
import {MagnifyingGlassIcon} from "@/assets/icons/index.js";
import searchBarStyles from "./SearchBar.module.css";
import AlertMessage from "@/components/alert-message/AlertMessage.jsx";

const SearchBar = () => {
  const [value, setValue] = useState("");

  return (
    <Flex direction="row" align="center" className={searchBarStyles.flexbox}>
      <TextInput
        classNames={{
          input: searchBarStyles.input,
          root: searchBarStyles.root,
          section: searchBarStyles.section
        }}
        size="xs"
        placeholder="Search"
        leftSection={<MagnifyingGlassIcon className={searchBarStyles.icon} />}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </Flex>
  );
};

const TopActions = ({showSearchBar, actions=[]}) => {
  if(!showSearchBar && actions.length === 0) { return null; }

  return (
    <Flex direction="row" align="center" justify="space-between" mb={22.5}>
      { showSearchBar && <SearchBar /> }
      {
        actions.length > 0 ?
          (
            <Flex direction="row" gap="sm">
              {
                actions.map(({label, variant="filled", onClick, disabled, leftSection, iconOnly, color}, i) => (
                  iconOnly ?
                    (
                      <ActionIcon key={`top-action-${i}`} variant={variant} size="36">
                        { leftSection }
                      </ActionIcon>
                    ) :
                    (
                      <Button
                        onClick={onClick}
                        key={`top-action-${label}`}
                        disabled={disabled}
                        leftSection={leftSection}
                        variant={variant}
                        color={color}
                      >
                        { label ? label : null }
                      </Button>
                    )
                ))
              }
            </Flex>
          ) : null
      }
    </Flex>
  );
};

const TitleSection = ({title, subtitle, rightSection, leftSection}) => {
  return (
    <Flex direction="column" mb={22.5}>
      <Group gap={6}>
        {
          leftSection ? leftSection : null
        }
        <Group gap={20}>
          <Title order={1} c="elv-gray.9">
            { title }
          </Title>
          {
            rightSection ? rightSection : null
          }
        </Group>
      </Group>
      <Box display="block">
        {
          subtitle &&
          <Title order={6} c="elv-gray.6" mt={0}>{subtitle}</Title>
        }
      </Box>
    </Flex>
  );
};

const PageContainer = ({
  title,
  subtitle,
  className,
  children,
  width="100%",
  error,
  showSearchBar=false,
  actions=[],
  titleRightSection,
  titleLeftSection,
  ...rest
}) => {
  return (
    <Box p="24 46 46" w={width} className={className} {...rest}>
      <AlertMessage error={error} />
      <TopActions showSearchBar={showSearchBar} actions={actions} />
      {
        title &&
        <TitleSection
          title={title}
          leftSection={titleLeftSection}
          subtitle={subtitle}
          rightSection={titleRightSection}
        />
      }
      { children }
    </Box>
  );
};

export default PageContainer;
