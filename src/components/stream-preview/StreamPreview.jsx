import {observer} from "mobx-react-lite";
import {useParams, useNavigate} from "react-router-dom";
import {Button, Loader} from "@mantine/core";
import {rootStore, streamBrowseStore} from "@/stores/index.js";
import AppFrame from "@/components/app-frame/AppFrame.jsx";
import styles from "./StreamPreview.module.css";
import PageContainer from "@/components/page-container/PageContainer.jsx";

const StreamPreview = observer(() => {
  const {id} = useParams();
  const navigate = useNavigate();

  const streamSlug = Object.keys(streamBrowseStore.streams || {}).find(slug => (
    streamBrowseStore.streams[slug].objectId === id
  ));
  const streamObject = streamBrowseStore.streams?.[streamSlug];

  if(!streamObject) {
    return (
      <div
        style={{
          display: "flex",
          height: "500px",
          width: "100%",
          alignItems: "center"
        }}
        className="stream-preview"
      >
        <Loader />
      </div>
    );
  }

  const libraryId = streamBrowseStore.streams[streamSlug].libraryId;
  const queryParams = {
    contentSpaceId: rootStore.contentSpaceId,
    libraryId,
    objectId: id,
    action: "display",
    // playerProfile: "live"
  };
  // eslint-disable-next-line no-undef
  const appUrl = EluvioConfiguration.displayAppUrl;

  return (
    <PageContainer
      title={`Preview ${streamObject.title || streamObject.objectId}`}
      titleLeftSection={
      <Button
        color="elv-gray.6"
        onClick={() => navigate("/streams")}
      >
        Back
      </Button>
      }
      p="24 0 0 46"
      h="100vh"
    >
      <AppFrame
        className={styles.root}
        appUrl={appUrl}
        queryParams={queryParams}
        onComplete={() => this.setState({completed: true})}
        onCancel={() => this.setState({completed: true})}
        Reload={() => this.setState({pageVersion: this.state.pageVersion + 1})}
      />
    </PageContainer>
  );
});

export default StreamPreview;
