import {Flex, Tabs, Title} from "@mantine/core";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import ConfigProfiles from "@/pages/settings/config-profiles/ConfigProfiles.jsx";
import DedicatedNodes from "@/pages/settings/dedicated-nodes/DedicatedNodes.jsx";
import DeclaredTags from "@/pages/settings/declared-tags/DeclaredTags.jsx";
import CustomDomain from "@/pages/settings/custom-domain/CustomDomain.jsx";

const SETTINGS_TABS = [
  {label: "Config Profiles", value: "configProfiles", Component: ConfigProfiles},
  {label: "Dedicated Nodes", value: "dedicatedNodes", Component: DedicatedNodes},
  {label: "Declared Tags", value: "declaredTags", Component: DeclaredTags},
  {label: "Custom Domain", value: "customDomain", Component: CustomDomain}
];

const Settings = () => {
  return (
    <PageContainer
      title="Settings"
    >
      <Tabs defaultValue="configProfiles" mb={50}>
        <Flex justify="space-between" align="center" mb={22}>
          <Tabs.List>
            {
              SETTINGS_TABS.map(tab => (
                <Tabs.Tab value={tab.value} key={`settings-tab-${tab.value}`}>
                  <Title order={3} c="elv-gray.9">{tab.label}</Title>
                </Tabs.Tab>
              ))
            }
          </Tabs.List>
        </Flex>
        {
          SETTINGS_TABS.map(tab => (
            <Tabs.Panel value={tab.value} key={`settings-panel-${tab.value}`}>
              <tab.Component />
            </Tabs.Panel>
          ))
        }
      </Tabs>
    </PageContainer>
  );
};

export default Settings;
