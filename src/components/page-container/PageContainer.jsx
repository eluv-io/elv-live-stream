import {ActionIcon, Box, Button, Flex, Group, TextInput, Title} from "@mantine/core";
import {useState} from "react";
import searchBarStyles from "./SearchBar.module.css";
import AlertMessage from "@/components/alert-message/AlertMessage.jsx";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import {IconSearch} from "@tabler/icons-react";

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
        leftSection={<IconSearch className={searchBarStyles.icon} />}
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
                actions.map(({label, buttonVariant="filled", iconVariant, onClick, disabled, disabledTooltip, leftSection, iconOnly, color, component, to}, i) => {
                  const button = iconOnly ?
                    (
                      <ActionIcon key={disabledTooltip ? undefined : `top-action-${i}`} variant={iconVariant} size="36" disabled={disabled}>
                        { leftSection }
                      </ActionIcon>
                    ) :
                    (
                      <Button
                        onClick={onClick}
                        key={disabledTooltip ? undefined : `top-action-${label}`}
                        disabled={disabled && !disabledTooltip}
                        leftSection={leftSection}
                        variant={buttonVariant}
                        color={color}
                        component={component}
                        to={to}
                      >
                        { label ? label : null }
                      </Button>
                    );

                  return disabled && disabledTooltip ?
                    (
                      <DisabledTooltipWrapper key={`top-action-${label || i}`} disabled tooltipLabel={disabledTooltip}>
                        { button }
                      </DisabledTooltipWrapper>
                    ) :
                    button;
                })
              }
            </Flex>
          ) : null
      }
    </Flex>
  );
};

const TitleSection = ({title, titleBadge, subtitle, subtitleRightSection, rightSection, leftSection, mb}) => {
  return (
    <Flex direction="column" gap={6} mb={mb}>
      <Group justify="space-between" wrap="nowrap" w="100%">
        <Group gap={16}>
          {
            leftSection ? leftSection : null
          }
          <Title order={1} c="elv-gray.9">
            { title }
          </Title>
          {
            titleBadge ? titleBadge : null
          }
        </Group>
        {
          rightSection ? rightSection : null
        }
      </Group>
      <Box display="block">
        <Group gap={8}>
          {
            subtitle &&
            <Title order={6} c="elv-gray.6" mt={0}>{subtitle}</Title>
          }
          {
            subtitleRightSection ? subtitleRightSection : null
          }
        </Group>
      </Box>
    </Flex>
  );
};

const PageContainer = ({
  title,
  subtitle,
  subtitleRightSection,
  className,
  children,
  error,
  showSearchBar=false,
  actions=[],
  titleRightSection,
  titleLeftSection,
  titleBadge,
  mb=20,
  p="24px 24px 46px",
  ...rest
}) => {
  return (
    <Box
      p={p}
      w="100%"
      className={className}
      {...rest}
    >
      <AlertMessage error={error} />
      <TopActions showSearchBar={showSearchBar} actions={actions} />
      {
        title &&
        <TitleSection
          title={title}
          titleBadge={titleBadge}
          leftSection={titleLeftSection}
          subtitle={subtitle}
          subtitleRightSection={subtitleRightSection}
          rightSection={titleRightSection}
          mb={mb}
        />
      }
      { children }
    </Box>
  );
};

export default PageContainer;
