import PageContainer from "@/components/page-container/PageContainer.jsx";
import ConfigProfiles from "@/pages/settings/config-profiles/ConfigProfiles.jsx";
import DedicatedNodes from "@/pages/settings/dedicated-nodes/DedicatedNodes.jsx";

const Settings = () => {
  return (
    <PageContainer
      title="Settings"
    >
      <ConfigProfiles />
      <DedicatedNodes />
    </PageContainer>
  );
};

export default Settings;
