import {ActionIcon, Box, Button, Flex, Group, ScrollArea, TextInput, Title} from "@mantine/core";
import {useEffect, useState} from "react";
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

const TitleSection = ({title, subtitle, rightSection, leftSection, mb}) => {
  return (
    <Flex direction="column" mb={mb}>
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
  mb=20,
  ...rest
}) => {
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  useEffect(() => {
    const CalculateScrollbarWidth = () => {
      const value = window.innerWidth - document.documentElement.clientWidth;
      setScrollbarWidth(value);
    };

    CalculateScrollbarWidth();
    window.addEventListener("resize", CalculateScrollbarWidth);

    return () => window.removeEventListener("resize", CalculateScrollbarWidth);
  }, []);
  return (
    <Box pt={24} pl={46} pb={46} w={width} className={className} {...rest}>
      <AlertMessage error={error} />
      <TopActions showSearchBar={showSearchBar} actions={actions} />
      {
        title &&
        <TitleSection
          title={title}
          leftSection={titleLeftSection}
          subtitle={subtitle}
          rightSection={titleRightSection}
          mb={mb}
        />
      }
      <ScrollArea type="hover">
        <Box pr={`calc(46px - ${scrollbarWidth}px)`}>
          { children }
        </Box>
      </ScrollArea>
    </Box>
  );
};

export default PageContainer;
