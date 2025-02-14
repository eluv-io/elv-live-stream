import {observer} from "mobx-react-lite";
import {useParams, Link} from "react-router-dom";
import {IconArrowBackUp} from "@tabler/icons-react";
import {ActionIcon, Loader} from "@mantine/core";
import {rootStore, streamStore} from "@/stores/index.js";
import AppFrame from "@/components/app-frame/AppFrame.jsx";
import styles from "./StreamPreview.module.css";

const StreamPreview = observer(() => {
  const {id} = useParams();
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
    playerProfile: "live"
  };
  // eslint-disable-next-line no-undef
  const appUrl = EluvioConfiguration.displayAppUrl;

  return (
    <div className="stream-preview">
      <div className="page-header">
        <ActionIcon component={Link} to="/streams" title="Back to Streams">
          <IconArrowBackUp />
        </ActionIcon>
        Preview { streamObject.display_title || streamObject.title || streamObject.objectId }
      </div>
      <AppFrame
        className={styles.root}
        appUrl={appUrl}
        queryParams={queryParams}
        onComplete={() => this.setState({completed: true})}
        onCancel={() => this.setState({completed: true})}
        Reload={() => this.setState({pageVersion: this.state.pageVersion + 1})}
      />
    </div>
  );
});

export default StreamPreview;
