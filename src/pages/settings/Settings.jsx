import {Loader, Tabs} from "@mantine/core";
import {observer} from "mobx-react-lite";
import {rootStore} from "@/stores/index.js";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import PlayoutProfiles from "@/pages/settings/playout-profiles/PlayoutProfiles.jsx";

const Settings = observer(() => {
  if(!rootStore.loaded) { return <Loader />; }

  return (
    <PageContainer
      title="Settings"
    >
      <Tabs defaultValue="liveRecordingProfiles">
        <Tabs.List>
          <Tabs.Tab value="liveRecordingProfiles">Live Recording Config Profiles</Tabs.Tab>
          <Tabs.Tab value="playoutProfiles">Playout Profiles</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="liveRecordingProfiles"></Tabs.Panel>

        <Tabs.Panel value="playoutProfiles">
          <PlayoutProfiles />
        </Tabs.Panel>
      </Tabs>
    </PageContainer>
  );
});

export default Settings;
