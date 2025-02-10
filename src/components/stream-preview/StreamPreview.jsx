import {observer} from "mobx-react-lite";
import {useParams, useNavigate} from "react-router-dom";
import {Loader} from "@mantine/core";
import {rootStore, streamStore} from "@/stores/index.js";
import AppFrame from "@/components/app-frame/AppFrame.jsx";
import styles from "./StreamPreview.module.css";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {IconChevronLeft} from "@tabler/icons-react";

const StreamPreview = observer(() => {
  const {id} = useParams();
  const navigate = useNavigate();

  const streamSlug = Object.keys(streamStore.streams || {}).find(slug => (
    streamStore.streams[slug].objectId === id
  ));
  const streamObject = streamStore.streams?.[streamSlug];

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

  const libraryId = streamStore.streams[streamSlug].libraryId;
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
      actions={[
        {
          label: "All Streams",
          leftSection: <IconChevronLeft height={18} />,
          variant: "filled",
          onClick: () => navigate("/streams")
        }
      ]}
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
